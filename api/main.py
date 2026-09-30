"""
=============================================================================
Project Athena — Stage 5: Custom SOC Dashboard Backend
=============================================================================
File: api/main.py

Architecture:
  Elasticsearch (port 9200)
    ├── cowrie-logs-*     (raw honeypot events)
    ├── athena-sessions   (aggregated + ML-scored sessions)
    └── athena-alerts     (confirmed anomaly alerts)
          │
          ▼
  FastAPI (port 8000)
    ├── Background Auto-Scorer (runs ML pipeline automatically on new logs)
    ├── GET  /api/stats            → aggregate KPIs + latest session verdict
    ├── GET  /api/sessions         → recent ML-scored sessions
    ├── GET  /api/alerts           → recent anomaly alerts
    ├── GET  /api/feed             → deduplicated raw Cowrie event stream
    ├── POST /api/simulate/{mode}  → 1-click live SSH attack/benign simulator
    └── WS   /ws/live              → broadcasts snapshot every 2s
=============================================================================
"""

import os
import sys
import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from elasticsearch import Elasticsearch

# Ensure project root is on sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from ml.anomaly_detector import AthenaSessionPipeline
from scripts.simulate_attack import (
    run_brute_force_attack,
    run_credential_spray,
    run_benign_session,
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ES_HOST = os.getenv("ELASTICSEARCH_HOST", "http://localhost:9200")
POLL_INTERVAL_SECONDS = 2   # Fast 2s WebSocket refresh cadence
MAX_FEED_EVENTS = 40        # Raw events in the live feed
MAX_SESSIONS = 30           # Sessions in the sessions endpoint
MAX_ALERTS = 25             # Alerts in the alerts endpoint

INDEX_RAW      = "cowrie-logs-*"
INDEX_SESSIONS = "athena-sessions"
INDEX_ALERTS   = "athena-alerts"

# Relevant security event types for the live telemetry stream (filters out noisy kex/version spam)
MEANINGFUL_EVENT_IDS = [
    "cowrie.login.failed",
    "cowrie.login.success",
    "cowrie.command.input",
    "cowrie.command.failed",
    "cowrie.session.connect",
    "cowrie.session.closed",
]

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("AthenaAPI")

es = Elasticsearch(ES_HOST)
_ml_pipeline: AthenaSessionPipeline | None = None
_last_raw_count: int = -1
_sim_lock = asyncio.Lock()

# Global snapshot cache shared across all WebSocket connections
_snapshot: dict[str, Any] = {}
_ws_clients: set[WebSocket] = set()


def _get_pipeline() -> AthenaSessionPipeline:
    global _ml_pipeline
    if _ml_pipeline is None:
        _ml_pipeline = AthenaSessionPipeline(es)
    return _ml_pipeline


# ---------------------------------------------------------------------------
# Elasticsearch query helpers
# ---------------------------------------------------------------------------

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
    Sorted by start_time descending — most recent alert at top.
    """
    try:
        r = es.search(index=INDEX_ALERTS, body={
            "size": limit,
            "sort": [{"start_time": {"order": "desc", "unmapped_type": "date"}}],
            "query": {"match_all": {}},
        })
        return [h["_source"] for h in r["hits"]["hits"]]
    except Exception as e:
        logger.warning(f"alerts query failed: {e}")
        return []


def _query_feed(limit: int = MAX_FEED_EVENTS) -> list[dict]:
    """
    Retrieve the most recent meaningful Cowrie events from cowrie-logs-*,
    deduplicated so container restarts never produce duplicate lines.
    """
    try:
        r = es.search(index=INDEX_RAW, body={
            "size": limit * 3,
            "sort": [{"timestamp": {"order": "desc", "unmapped_type": "date"}}],
            "query": {
                "terms": {"eventid.keyword": MEANINGFUL_EVENT_IDS}
            },
            "_source": ["session", "src_ip", "eventid", "timestamp",
                        "message", "username", "password", "input"],
        })
        hits = [h["_source"] for h in r["hits"]["hits"]]
    except Exception:
        hits = []

    # Fallback if eventid.keyword wasn't mapped
    if not hits:
        try:
            r = es.search(index=INDEX_RAW, body={
                "size": limit * 3,
                "sort": [{"timestamp": {"order": "desc", "unmapped_type": "date"}}],
                "query": {"match_all": {}},
                "_source": ["session", "src_ip", "eventid", "timestamp",
                            "message", "username", "password", "input"],
            })
            hits = [
                h["_source"] for h in r["hits"]["hits"]
                if h["_source"].get("eventid") in MEANINGFUL_EVENT_IDS
            ]
        except Exception as e:
            logger.warning(f"feed query failed: {e}")
            return []

    deduped = []
    seen = set()
    for evt in hits:
        key = (
            evt.get("session", ""),
            evt.get("timestamp", ""),
            evt.get("eventid", ""),
            str(evt.get("message", "")),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(evt)
        if len(deduped) >= limit:
            break

    return deduped


def _query_stats(recent_sessions: list[dict]) -> dict[str, Any]:
    """
    Aggregate counts and KPIs from all three indices.
    Includes both global aggregates AND the latest session's live score/features
    so the Threat Detector gauge responds immediately to new sessions.
    """
    total_raw = 0
    try:
        r = es.count(index=INDEX_RAW)
        total_raw = r["count"]
    except Exception:
        pass

    total_sessions, total_alerts = 0, 0
    avg_score, max_score = 0.0, 0.0

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

    try:
        r = es.search(index=INDEX_SESSIONS, body={
            "size": 0,
            "aggs": {
                "avg_score": {"avg": {"field": "anomaly_score"}},
                "max_score": {"max": {"field": "anomaly_score"}},
            }
        })
        avg_score = round(r["aggregations"]["avg_score"]["value"] or 0.0, 4)
        max_score = round(r["aggregations"]["max_score"]["value"] or 0.0, 4)
    except Exception:
        pass

    latest_session = recent_sessions[0] if recent_sessions else None
    latest_score = round(float(latest_session.get("anomaly_score", 0.0)), 4) if latest_session else max_score

    return {
        "total_raw_events": total_raw,
        "total_sessions": total_sessions,
        "total_alerts": total_alerts,
        "benign_sessions": max(0, total_sessions - total_alerts),
        "active_alerts": total_alerts,
        "avg_anomaly_score": avg_score,
        "max_anomaly_score": max_score,
        "latest_anomaly_score": latest_score,
        "latest_session": latest_session,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


def _build_snapshot(force_ml_eval: bool = False) -> dict[str, Any]:
    """
    Assembles the full data payload that gets broadcast to WebSocket clients.
    Automatically triggers ML session evaluation whenever new raw logs arrive!
    """
    global _last_raw_count
    try:
        raw_count = es.count(index=INDEX_RAW)["count"]
    except Exception:
        raw_count = 0

    if force_ml_eval or (raw_count != _last_raw_count and raw_count > 0):
        try:
            pipeline = _get_pipeline()
            pipeline.evaluate_and_index_sessions()
            _last_raw_count = raw_count
        except Exception as e:
            logger.warning(f"Auto ML evaluation warning: {e}")

    sessions = _query_sessions()
    alerts = _query_alerts()
    feed = _query_feed()
    stats = _query_stats(sessions)

    return {
        "type": "snapshot",
        "stats": stats,
        "sessions": sessions,
        "alerts": alerts,
        "feed": feed,
    }


async def _broadcast_snapshot(snap: dict[str, Any]):
    """Pushes a snapshot immediately to all connected WebSocket clients."""
    payload = json.dumps(snap, default=str)
    dead = set()
    for ws in _ws_clients.copy():
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)
    _ws_clients.difference_update(dead)


async def _poll_loop():
    """
    Runs forever in the background, querying ES every POLL_INTERVAL_SECONDS
    and pushing updates to connected WebSocket clients.
    """
    global _snapshot
    while True:
        try:
            snap = await asyncio.to_thread(_build_snapshot, False)
            _snapshot = snap
            await _broadcast_snapshot(snap)
        except Exception as e:
            logger.error(f"Poll loop error: {e}")

        await asyncio.sleep(POLL_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_poll_loop())
    logger.info("Athena API started — auto-evaluating ML & polling Elasticsearch every %ds", POLL_INTERVAL_SECONDS)
    yield
    task.cancel()
    logger.info("Athena API shutting down.")


app = FastAPI(
    title="Athena SOC API",
    description="Real-time honeypot telemetry, ML anomaly detection, and live attack simulation API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# HTTP REST endpoints
# ---------------------------------------------------------------------------

@app.get("/api/stats")
async def get_stats():
    if _snapshot:
        return _snapshot.get("stats", {})
    snap = await asyncio.to_thread(_build_snapshot, False)
    return snap.get("stats", {})


@app.get("/api/sessions")
async def get_sessions(limit: int = MAX_SESSIONS):
    if _snapshot:
        return _snapshot.get("sessions", [])[:limit]
    return await asyncio.to_thread(_query_sessions, limit)


@app.get("/api/alerts")
async def get_alerts(limit: int = MAX_ALERTS):
    if _snapshot:
        return _snapshot.get("alerts", [])[:limit]
    return await asyncio.to_thread(_query_alerts, limit)


@app.get("/api/feed")
async def get_feed(limit: int = MAX_FEED_EVENTS):
    if _snapshot:
        return _snapshot.get("feed", [])[:limit]
    return await asyncio.to_thread(_query_feed, limit)


@app.post("/api/simulate/{mode}")
async def simulate_traffic(mode: str):
    """
    One-click simulation endpoint invoked directly from the SOC Dashboard UI
    (or via API). Generates real SSH traffic against Cowrie port 2222, waits
    briefly for Filebeat ingestion, runs ML scoring, and broadcasts the new
    state to all connected WebSocket clients.
    """
    global _snapshot
    if mode not in ("brute-force", "spray", "benign"):
        raise HTTPException(status_code=400, detail="Invalid mode. Choose 'brute-force', 'spray', or 'benign'.")

    async with _sim_lock:
        def _execute_sim():
            if mode == "brute-force":
                res = run_brute_force_attack("localhost", 2222, target_user="root", attempts=10, delay=0.06)
            elif mode == "spray":
                res = run_credential_spray("localhost", 2222, password="password123", delay=0.06)
            else:
                res = run_benign_session("localhost", 2222, username="root", password="password")

            # Wait briefly for Filebeat to flush the new events to Elasticsearch
            time.sleep(1.2)
            snap = _build_snapshot(force_ml_eval=True)
            return res, snap

        sim_result, snap = await asyncio.to_thread(_execute_sim)
        _snapshot = snap
        await _broadcast_snapshot(snap)
        return {
            "status": "ok",
            "simulation": sim_result,
            "latest_session": snap["stats"].get("latest_session"),
        }


@app.get("/health")
async def health():
    try:
        es.ping()
        es_ok = True
    except Exception:
        es_ok = False
    return {"status": "ok", "elasticsearch": es_ok}


@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    await websocket.accept()
    _ws_clients.add(websocket)
    logger.info(f"WS client connected. Active clients: {len(_ws_clients)}")

    try:
        if _snapshot:
            await websocket.send_text(json.dumps(_snapshot, default=str))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        _ws_clients.discard(websocket)
        logger.info(f"WS client disconnected. Active clients: {len(_ws_clients)}")
