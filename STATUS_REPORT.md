# PROJECT ATHENA — COMPREHENSIVE STATUS & ARCHITECTURE REPORT
**Date:** September 1, 2026  
**Project:** Self-Hosted Honeypot SOC Platform with ML Anomaly Detection  
**Context:** Academic Capstone / Major Project (Semester III B.Tech IT, VIT)  
**Status:** **Stages 1 through 5 FULLY IMPLEMENTED, INTEGRATED, AND VALIDATED**

---

## 1. Executive Summary

Project Athena is an end-to-end, zero-cloud-cost Security Operations Center (SOC) intelligence and deceptive defense platform. It pairs medium-interaction SSH honeypot emulation (**Cowrie**) with high-performance log shipping (**Filebeat**) and distributed indexing (**Elasticsearch 8.17.2**), driven by a dual-tier hybrid machine learning engine (**Rule Pre-Filter + Unsupervised Isolation Forest**). 

The platform features two operational interfaces:
1. **Kibana 8.17.2 SOC Dashboard:** Industrial analytics and telemetry data views.
2. **Athena Custom SOC Intelligence Terminal:** A custom presentation-layer frontend inspired by private banking trading desks and Bloomberg Terminals (**FastAPI async backend + React 19 + Tailwind CSS + Framer Motion + Recharts**).

---

## 2. Complete Architecture & Data Flow

```
                      [ Attacker / Adversary Traffic ]
                                     │
                                     ▼ (Port 2222 / SSH)
                      ┌──────────────────────────────┐
                      │    Cowrie Honeypot (Docker)  │
                      │  Emulates fake Linux shell   │
                      │  Captures commands/passwords │
                      └──────────────┬───────────────┘
                                     │ (Shared Docker Volume: cowrie.json)
                                     ▼
                      ┌──────────────────────────────┐
                      │    Filebeat 8.17.2 (Docker)  │
                      │  Parses structured NDJSON    │
                      │  Low-overhead streaming      │
                      └──────────────┬───────────────┘
                                     │ (HTTP 9200)
                                     ▼
                      ┌──────────────────────────────┐
                      │  Elasticsearch 8.17.2 (Docker│
                      │  Indices:                    │
                      │    - cowrie-logs-*           │
                      │    - athena-sessions         │
                      │    - athena-alerts           │
                      └──────────────┬───────────────┘
                                     │
        ┌────────────────────────────┴────────────────────────────┐
        │ (Periodic scoring)                                      │ (Real-time 3s poll)
        ▼                                                         ▼
┌──────────────────────────────┐                ┌──────────────────────────────────┐
│ ML Anomaly Detector Engine   │                │ FastAPI Backend (`api/main.py`)  │
│ Tier 1: Rule Pre-Filter      │                │  - GET /api/stats, /sessions, etc│
│ Tier 2: Isolation Forest     │                │  - WS /ws/live (atomic snapshot) │
│ (Saves to athena-sessions    │                └─────────────────┬────────────────┘
│  and athena-alerts)          │                                  │ (WebSocket Push)
└──────────────┬───────────────┘                                  ▼
               │                                ┌──────────────────────────────────┐
               ▼                                │ React SOC Dashboard (`/dashboard`)
┌──────────────────────────────┐                │  - StatsBar (KPI Ribbon)         │
│ Kibana SOC Dashboard         │                │  - AnomalyGauge (SVG Arc Gauge)  │
│ Port 5601                    │                │  - LiveFeed (Raw Telemetry)      │
│ Pre-provisioned saved objects│                │  - AlertStream (ML Incidents)    │
└──────────────────────────────┘                │  - AttackerList (Density Vectors)│
                                                │  - TimelineChart (Recharts Area) │
                                                └──────────────────────────────────┘
```

---

## 3. Stage-by-Stage Implementation Breakdown

### STAGE 1: Log Pipeline & Honeypot Ingestion (COMPLETE)
- **`docker-compose.yml`**: Provisions 4 isolated services on the `athena-net` bridge network:
  - `cowrie-honeypot` (`cowrie/cowrie:latest`): Exposed on host port `2222:2222`.
  - `elasticsearch` (`elasticsearch:8.17.2`): Single-node, security disabled (`xpack.security.enabled=false`), memory capped at 1GB heap.
  - `kibana` (`kibana:8.17.2`): Port `5601:5601`.
  - `filebeat` (`filebeat:8.17.2`): Mounts `cowrie-var` volume read-only.
- **`config/filebeat.yml`**: Configured with `type: log`, `json.keys_under_root: true`, and ILM disabled to stream directly into time-series indices `cowrie-logs-YYYY.MM.DD`.

### STAGE 2: Machine Learning Detection Engine (COMPLETE)
- **`ml/anomaly_detector.py`**:
  - **Session-Level Aggregation (`aggregate_sessions`)**: Groups raw Cowrie events by `session` UUID. Derives 4 feature dimensions:
    1. `login_attempts_per_min` ($\text{attempts} / \text{duration} \times 60$)
    2. `unique_usernames` (cardinality of targeted usernames)
    3. `session_duration` (clamped to $\ge 1.0\text{s}$ to prevent division-by-zero)
    4. `command_count` (interactive bash commands entered post-auth)
  - **Tier 1 (Rule Pre-filter)**: Instant signature matching for aggressive brute-force ($\ge 8\text{ logins/min}, \ge 5\text{ fails}$) or rapid credential sprays ($\ge 4\text{ usernames}$).
  - **Tier 2 (Unsupervised Isolation Forest)**: Scikit-learn model trained on baseline non-attack traffic (`contamination=0.08`, `n_estimators=100`, `random_state=42`).
  - **Model Persistence**: Serialized to `ml/isolation_forest.joblib`.
  - **Daemon Mode**: Can run continuously with `--daemon --interval 15`.

### STAGE 3: Kibana Analytics & Dashboards (COMPLETE)
- **`scripts/setup_kibana.py`**: Automated bootstrapping script querying Kibana REST API.
- Provisions Data Views: `cowrie-logs-*`, `athena-sessions*`, `athena-alerts*`.
- Imports saved dashboard objects (`kibana/athena_dashboard.ndjson`) with attack origin metrics, command frequency, and anomaly score distribution.

### STAGE 4: Attack Simulation & End-to-End Validation (COMPLETE)
- **`scripts/simulate_attack.py`**: Multi-mode Paramiko attack generator:
  - `--mode brute-force`: High-velocity single-user password guessing.
  - `--mode spray`: Multi-user credential spraying across administrative accounts.
  - `--mode benign`: Legitimate operator login executing standard Linux commands (`ls`, `whoami`, `cat /etc/os-release`).
- **`scripts/test_pipeline.py`**: Automated 6-step verification suite.
- **Validation Benchmark**:
  - Ingested Documents: $207+$ Cowrie raw events.
  - Scored Sessions: $32$ distinct session vectors.
  - Pipeline Latency: $\approx 9.09\text{s}$ from packet injection to alert indexing.

### STAGE 5: Custom SOC Terminal & FastAPI Backend (COMPLETE)
- **Backend Service (`api/main.py`)**:
  - Built with **FastAPI** + **Uvicorn** + **Elasticsearch Python SDK (v8.x)**.
  - Non-blocking architecture: Executes sync ES queries in worker threads using `asyncio.to_thread`.
  - Polling loop gathers snapshots every 3s and broadcasts over WebSocket (`ws://localhost:8000/ws/live`).
  - REST endpoints: `/api/stats`, `/api/sessions`, `/api/alerts`, `/api/feed`, `/health`.
- **Frontend Dashboard (`/dashboard`)**:
  - Built with **React 19**, **Vite 8**, **Tailwind CSS v4** (`@tailwindcss/vite`), **Framer Motion**, and **Recharts**.
  - **Aesthetic Direction**: Private bank trading desk / Bloomberg Terminal. Deep near-black palette (`#0F1117`), dark slate surface (`#161A23`), warm ivory text (`#E8E0D0`), antique brass accent (`#B8965A`), and hairline borders (`#252A35`).
  - **Components Implemented**:
    - `StatsBar.jsx`: Animated KPI metric ribbon with localized number formatting.
    - `AnomalyGauge.jsx`: Pure SVG radial arc gauge with mathematical arc calculations ($240^\circ$ sweep) and anomaly threshold indicators ($0.50$ boundary).
    - `LiveFeed.jsx`: Live honeypot log stream with Framer Motion slide-in transitions.
    - `AlertStream.jsx`: Scored incident log with Tier-1 vs Tier-2 ML categorization.
    - `AttackerList.jsx`: Unique IP attack density bars and targeted username extraction.
    - `TimelineChart.jsx`: Financial-grade area chart for chronological anomaly score tracking.
    - `useWebSocket.js` & `reducer.js`: Resilient auto-reconnecting socket hook with centralized atomic state transitions.

---

## 4. Current File & Directory Structure

```
c:\Work\SY\athena\athena\
├── PROJECT_BRIEF.md                # Project requirements, roadmap & locked scope
├── README.md                       # Documentation, quickstart & viva cheat sheet
├── STATUS_REPORT.md                # Master handover status report
├── docker-compose.yml              # Cowrie + ES + Kibana + Filebeat stack
├── requirements.txt                # Pinned Python dependencies (ES, Scikit-learn, FastAPI, etc.)
│
├── api/
│   └── main.py                     # FastAPI backend (REST + /ws/live WebSocket engine)
│
├── config/
│   └── filebeat.yml                # Filebeat log ingestion configuration
│
├── dashboard/                      # React 19 + Vite SOC Frontend
│   ├── index.html                  # HTML entry with EB Garamond & DM Mono fonts
│   ├── vite.config.js              # Vite config with React & Tailwind v4 plugins
│   ├── package.json                # Frontend dependencies (Recharts, Framer Motion, etc.)
│   └── src/
│       ├── App.jsx                 # Master terminal layout & orchestration
│       ├── main.jsx                # React root mount
│       ├── index.css               # Tailwind v4 theme variables & hairline utilities
│       ├── store/
│       │   └── reducer.js          # Centralized SOC state reducer
│       ├── hooks/
│       │   ├── useWebSocket.js     # Auto-reconnecting WebSocket hook
│       │   └── useApiData.js       # Bootstrap REST loader
│       ├── ui/
│       │   ├── Panel.jsx           # Hairline border panel with serif header
│       │   └── RiskBadge.jsx       # Restrained threat level indicator
│       └── components/
│           ├── StatsBar.jsx        # Top metric ribbon
│           ├── AnomalyGauge.jsx    # SVG radial arc gauge
│           ├── LiveFeed.jsx        # Streaming raw Cowrie events
│           ├── AlertStream.jsx     # Scored anomaly incidents
│           ├── AttackerList.jsx    # IP density & target credentials
│           └── TimelineChart.jsx   # Chronological Recharts area chart
│
├── kibana/
│   └── athena_dashboard.ndjson     # Exported Kibana dashboard saved objects
│
├── ml/
│   ├── anomaly_detector.py         # Dual-tier Rule + Isolation Forest detection engine
│   └── isolation_forest.joblib     # Serialized trained scikit-learn model
│
└── scripts/
    ├── setup_kibana.py             # Kibana automated Data View & dashboard provisioner
    ├── simulate_attack.py          # Paramiko SSH brute-force/spray generator
    └── test_pipeline.py            # Automated end-to-end integration test runner
```

---

## 5. How to Run the Entire System

### Step 1: Start Docker Stack (Honeypot + Elastic Stack)
```bash
docker compose up -d
```
*Verify with `docker compose ps` — all 4 containers should be `Up`.*

### Step 2: Start the ML Detection Daemon (Background Worker)
```bash
python ml/anomaly_detector.py --daemon --interval 15
```

### Step 3: Start the FastAPI Backend
```bash
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```
*API Swagger Docs: `http://localhost:8000/docs`*

### Step 4: Start the React SOC Dashboard
```bash
cd dashboard
npm run dev
```
*Dashboard Terminal: `http://localhost:5173`*

### Step 5: (Optional) Inject Simulated Attacks
```bash
# In a separate terminal:
python scripts/simulate_attack.py --mode all
```

---

## 6. Viva Defense Reference Points

1. **Why Isolation Forest over Supervised Classifiers?**
   - Supervised models require labeled datasets that become obsolete due to concept drift and zero-day attacks. Isolation Forest is unsupervised and isolates anomalies based on the principle that outliers require fewer random recursive splits in feature space.
2. **Why Filebeat over Logstash?**
   - Cowrie logs structured JSON natively. Filebeat parses NDJSON with minimal resource consumption ($<50\text{MB}$ RAM vs Logstash's $1\text{GB}+$ JVM heap).
3. **Data Flow to React Dashboard:**
   - Honeypot $\rightarrow$ Filebeat $\rightarrow$ Elasticsearch $\rightarrow$ FastAPI background `asyncio` loop (running sync ES queries in thread pool via `asyncio.to_thread`) $\rightarrow$ WebSocket push to React $\rightarrow$ `useReducer` atomic state updates.
4. **Gauge Arc Mathematics:**
   - Rendered using pure SVG `stroke-dasharray` and `stroke-dashoffset` across a $240^\circ$ active sweep angle ($4.188\text{ rad}$), mapped linearly to the normalized anomaly score $[0.0, 1.0]$.
