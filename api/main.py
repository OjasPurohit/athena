"""
=============================================================================
Project Athena — Stage 5: Custom SOC Dashboard Backend
=============================================================================
File: api/main.py

Architecture for viva defense:
  ┌──────────────────────────────────────────────────────────────┐
  │  Elasticsearch (port 9200)                                   │
  │    ├── cowrie-logs-*     (raw honeypot events)               │
  │    ├── athena-sessions*  (aggregated + ML-scored sessions)   │
  │    └── athena-alerts*    (confirmed anomaly alerts)          │
  └───────────────────────────┬──────────────────────────────────┘
                              │ ES Python client (async queries)
                              ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  FastAPI (port 8000)                                         │
  │    ├── GET /api/stats    → aggregate counts + latency        │
  │    ├── GET /api/sessions → recent ML-scored sessions         │
  │    ├── GET /api/alerts   → recent anomaly alerts             │
  │    ├── GET /api/feed     → raw Cowrie event stream           │
  │    └── WS  /ws/live      → broadcasts snapshot every 3s      │
  └───────────────────────────┬──────────────────────────────────┘
                              │ WebSocket (JSON push)
                              ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  React Frontend (port 5173)                                  │
  │    useWebSocket() → useReducer() → Component re-render       │
  └──────────────────────────────────────────────────────────────┘

Key design choices:
  - FastAPI is async-native: ES queries do not block the event loop,
    so WebSocket clients receive timely updates even under load.
  - A single background task (`lifespan`) runs the ES polling loop.
    All connected WS clients share the same cached snapshot, so we
    hit ES once per interval regardless of how many browser tabs
    are open (efficient for a demo with multiple screens).
  - CORS is enabled only for localhost origins — not wildcard — which
    demonstrates awareness of web security in the viva.
=============================================================================
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from elasticsearch import Elasticsearch, NotFoundError

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ES_HOST = "http://localhost:9200"
POLL_INTERVAL_SECONDS = 3   # How often we re-query Elasticsearch
MAX_FEED_EVENTS = 30         # Raw events in the live feed
MAX_SESSIONS = 25            # Sessions in the sessions endpoint
MAX_ALERTS = 25              # Alerts in the alerts endpoint

# The three Elasticsearch indices created by the existing pipeline
INDEX_RAW     = "cowrie-logs-*"
INDEX_SESSIONS = "athena-sessions"
INDEX_ALERTS  = "athena-alerts"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("AthenaAPI")

# ---------------------------------------------------------------------------
# Elasticsearch client
# Synchronous client is fine here; FastAPI runs it in a thread executor
# when called from async context via asyncio.to_thread().
# ---------------------------------------------------------------------------
es = Elasticsearch(ES_HOST)

# ---------------------------------------------------------------------------
# Global snapshot cache
# One dict shared across all WebSocket connections — updated by the
# background poll loop, read by every WS client.
# ---------------------------------------------------------------------------
_snapshot: dict[str, Any] = {}

# Registry of all active WebSocket connections
_ws_clients: set[WebSocket] = set()


# ---------------------------------------------------------------------------
# Elasticsearch query helpers
# Each function is small, focused, and independently testable — important
# for explaining individual pieces in viva.
# ---------------------------------------------------------------------------

def _query_stats() -> dict[str, Any]:
    """
    Aggregate counts and KPIs from all three indices.
    Returns a flat dict of numbers suitable for the StatsBar component.
    """
    # Total raw events (= total connection-level events logged by Cowrie)
    total_raw = 0
    try:
        r = es.count(index=INDEX_RAW)
        total_raw = r["count"]
    except Exception:
        pass

    # Session counts — one document per unique session_id in athena-sessions
    total_sessions, total_alerts, active_alerts = 0, 0, 0
    avg_score = 0.0
    try:
        r = es.count(index=INDEX_SESSIONS)
        total_sessions = r["count"]
    except Exception:
        pass

    try:
        r = es.count(index=INDEX_ALERTS)
        total_alerts = r["count"]
    except Exception:
        pass

    # Active alerts = anomaly alerts evaluated within the last 10 minutes
    try:
        r = es.count(index=INDEX_ALERTS, body={
            "query": {"range": {"evaluated_at": {"gte": "now-10m"}}}
        })
        active_alerts = r["count"]
    except Exception:
        pass

    # Average anomaly score across all scored sessions
    try:
        r = es.search(index=INDEX_SESSIONS, body={
            "size": 0,
            "aggs": {"avg_score": {"avg": {"field": "anomaly_score"}}}
        })
        avg_score = round(r["aggregations"]["avg_score"]["value"] or 0.0, 4)
    except Exception:
        pass

    # Highest single anomaly score (drives the radial gauge)
    max_score = 0.0
    try:
        r = es.search(index=INDEX_SESSIONS, body={
            "size": 0,
            "aggs": {"max_score": {"max": {"field": "anomaly_score"}}}
        })
        max_score = round(r["aggregations"]["max_score"]["value"] or 0.0, 4)
    except Exception:
        pass

    return {
        "total_raw_events": total_raw,
        "total_sessions": total_sessions,
        "total_alerts": total_alerts,
        "active_alerts": active_alerts,
        "avg_anomaly_score": avg_score,
        "max_anomaly_score": max_score,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


def _query_sessions(limit: int = MAX_SESSIONS) -> list[dict]:
    """
    Retrieve the most recent ML-scored sessions from athena-sessions.
    Sorted by start_time descending so newest sessions appear first.
    """
    try:
        r = es.search(index=INDEX_SESSIONS, body={
            "size": limit,
            "sort": [{"start_time": {"order": "desc", "unmapped_type": "date"}}],
            "query": {"match_all": {}},
        })
        return [h["_source"] for h in r["hits"]["hits"]]
    except Exception as e:
        logger.warning(f"sessions query failed: {e}")
        return []


def _query_alerts(limit: int = MAX_ALERTS) -> list[dict]:
    """
    Retrieve the most recent anomaly alerts from athena-alerts.
    Sorted by evaluated_at descending — most recent alert at top.
    """
    try:
        r = es.search(index=INDEX_ALERTS, body={
            "size": limit,
            "sort": [{"evaluated_at": {"order": "desc", "unmapped_type": "date"}}],
            "query": {"match_all": {}},
        })
        return [h["_source"] for h in r["hits"]["hits"]]
    except Exception as e:
        logger.warning(f"alerts query failed: {e}")
        return []


def _query_feed(limit: int = MAX_FEED_EVENTS) -> list[dict]:
    """
    Retrieve the most recent raw Cowrie events from cowrie-logs-*.
    We project only the fields the frontend needs to keep the payload lean.
    """
    try:
        r = es.search(index=INDEX_RAW, body={
            "size": limit,
            "sort": [{"timestamp": {"order": "desc", "unmapped_type": "date"}}],
            "query": {"match_all": {}},
            "_source": ["session", "src_ip", "eventid", "timestamp",
                        "message", "username", "password"],
        })
        return [h["_source"] for h in r["hits"]["hits"]]
    except Exception as e:
        logger.warning(f"feed query failed: {e}")
        return []


def _build_snapshot() -> dict[str, Any]:
    """
    Assembles the full data payload that gets broadcast to WebSocket clients.
    Called once per poll interval — result is cached in _snapshot.
    """
    return {
        "type": "snapshot",
        "stats": _query_stats(),
        "sessions": _query_sessions(),
        "alerts": _query_alerts(),
        "feed": _query_feed(),
    }


# ---------------------------------------------------------------------------
# Background polling loop (runs as a lifespan task)
# ---------------------------------------------------------------------------

async def _poll_loop():
    """
    Runs forever in the background, querying ES every POLL_INTERVAL_SECONDS.
    Pushes the new snapshot to every connected WebSocket client.

    Why asyncio.to_thread()?
      The Elasticsearch client makes blocking HTTP calls. Running them in a
      thread executor (to_thread) releases the event loop during the IO wait,
      so WebSocket heartbeats and new HTTP requests are not blocked.
    """
    global _snapshot
    while True:
        try:
            # Run the blocking ES queries off the main event loop thread
            snap = await asyncio.to_thread(_build_snapshot)
            _snapshot = snap

            # Broadcast to every connected client
            payload = json.dumps(snap, default=str)
            dead = set()
            for ws in _ws_clients.copy():
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.add(ws)  # Mark disconnected clients for cleanup

            _ws_clients.difference_update(dead)

        except Exception as e:
            logger.error(f"Poll loop error: {e}")

        await asyncio.sleep(POLL_INTERVAL_SECONDS)


# ---------------------------------------------------------------------------
# FastAPI application lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager: starts the background poll loop when the
    server starts, cancels it cleanly on shutdown.
    This replaces the deprecated @app.on_event("startup") pattern.
    """
    task = asyncio.create_task(_poll_loop())
    logger.info("Athena API started — polling Elasticsearch every %ds", POLL_INTERVAL_SECONDS)
    yield
    task.cancel()
    logger.info("Athena API shutting down.")


app = FastAPI(
    title="Athena SOC API",
    description="Real-time honeypot telemetry and ML anomaly detection API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: allow only the Vite dev server origin (port 5173)
# In production, replace with the deployed frontend URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",  # fallback if running with npm start
    ],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# HTTP REST endpoints
# ---------------------------------------------------------------------------

@app.get("/api/stats")
async def get_stats():
    """
    Aggregate KPIs for the StatsBar component.
    Returns the cached snapshot stats to avoid a redundant ES query.
    Falls back to a live query if the cache is empty (server just started).
    """
    if _snapshot:
        return _snapshot.get("stats", {})
    return await asyncio.to_thread(_query_stats)


@app.get("/api/sessions")
async def get_sessions(limit: int = MAX_SESSIONS):
    """Latest ML-scored session documents from athena-sessions."""
    if _snapshot:
        return _snapshot.get("sessions", [])[:limit]
    return await asyncio.to_thread(_query_sessions, limit)


@app.get("/api/alerts")
async def get_alerts(limit: int = MAX_ALERTS):
    """Latest anomaly alerts from athena-alerts, newest first."""
    if _snapshot:
        return _snapshot.get("alerts", [])[:limit]
    return await asyncio.to_thread(_query_alerts, limit)


@app.get("/api/feed")
async def get_feed(limit: int = MAX_FEED_EVENTS):
    """Raw Cowrie event stream for the live feed panel."""
    if _snapshot:
        return _snapshot.get("feed", [])[:limit]
    return await asyncio.to_thread(_query_feed, limit)


@app.get("/health")
async def health():
    """Simple liveness probe. Returns 200 when the server is ready."""
    try:
        es.ping()
        es_ok = True
    except Exception:
        es_ok = False
    return {"status": "ok", "elasticsearch": es_ok}


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    """
    WebSocket endpoint for real-time dashboard updates.

    Connection lifecycle:
      1. Client sends HTTP Upgrade → WebSocket OPEN
      2. We immediately send the last cached snapshot (no wait for next poll)
      3. Client is added to _ws_clients registry
      4. The background _poll_loop() sends new snapshots every 3s
      5. On disconnect (tab close / network drop), WebSocketDisconnect is
         raised and we remove the client from the registry

    Why WebSocket over polling?
      - Single persistent TCP connection vs. repeated HTTP overhead
      - Server controls the cadence — frontend never over-polls
      - Scales to multiple simultaneous dashboard viewers with one ES query
    """
    await websocket.accept()
    _ws_clients.add(websocket)
    logger.info(f"WS client connected. Active clients: {len(_ws_clients)}")

    try:
        # Send the current snapshot immediately so the UI isn't blank
        if _snapshot:
            await websocket.send_text(json.dumps(_snapshot, default=str))

        # Keep the connection alive — the poll loop handles sends.
        # We just wait for disconnect here.
        while True:
            # Receive and discard any client messages (keepalive pings etc.)
            await websocket.receive_text()

    except WebSocketDisconnect:
        _ws_clients.discard(websocket)
        logger.info(f"WS client disconnected. Active clients: {len(_ws_clients)}")
