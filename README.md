# Athena — Self-Hosted Honeypot SOC Platform with ML Anomaly Detection

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.17.2-005571?logo=elasticsearch&logoColor=white)](https://elastic.co)
[![Kibana](https://img.shields.io/badge/Kibana-8.17.2-E5127D?logo=kibana&logoColor=white)](http://localhost:5601)
[![Scikit-Learn](https://img.shields.io/badge/scikit--learn-Isolation%20Forest-F7931E?logo=scikitlearn&logoColor=white)](https://scikit-learn.org)

> **Academic Project:** 2nd-Year B.Tech IT Major Project (VIT, Semester III)  
> **Team Members:** Ojas Purohit (44), Shayan Khalid (20), Anup Nikhar (40), Pranay Nikure (41)

---

## 1. Project Overview

**Athena** is a lightweight, zero-cloud-cost Security Operations Center (SOC) platform. It emulates vulnerable SSH and Telnet services using the **Cowrie honeypot**, ships high-fidelity attack telemetry into **Elasticsearch** using **Filebeat**, visualizes live attacks on a custom **Kibana SOC Dashboard**, and uses an **unsupervised Isolation Forest ML model** paired with a **rule-based pre-filter** to detect brute-force, credential spray, and anomalous sessions in real time.

```
   ┌─────────────────────────────────────────────────────────┐
   │                Attacker / Bot Traffic                   │
   └───────────────────────────┬─────────────────────────────┘
                               │ (Port 2222 / SSH)
                               ▼
   ┌─────────────────────────────────────────────────────────┐
   │                 Cowrie Honeypot                         │
   │        Emulates SSH terminal, records JSON telemetry    │
   └───────────────────────────┬─────────────────────────────┘
                               │ (Shared Volume: cowrie.json)
                               ▼
   ┌─────────────────────────────────────────────────────────┐
   │                 Filebeat Log Shipper                    │
   │       Parses NDJSON & streams logs in real-time         │
   └───────────────────────────┬─────────────────────────────┘
                               │ (HTTP:9200)
                               ▼
   ┌─────────────────────────────────────────────────────────┐
   │                 Elasticsearch 8.x                       │
   │       Indices: cowrie-logs-*, athena-sessions, alerts   │
   └───────────────┬─────────────────────────▲───────────────┘
                   │                         │ (Enriched Alerts)
                   │ (Raw Logs)              │
                   ▼                         │
   ┌─────────────────────────────────────────┴───────────────┐
   │       Athena ML Anomaly Detection Engine (Python)       │
   │  - Tier 1: Failed Login Rate Rule Pre-Filter            │
   │  - Tier 2: Unsupervised Isolation Forest (scikit-learn) │
   │  Features: [login_rate, unique_users, duration, cmd_cnt]│
   └─────────────────────────────────────────────────────────┘
                               │
                               ▼
   ┌─────────────────────────────────────────────────────────┐
   │                 Kibana SOC Dashboard                    │
   │     Live Telemetry, KPI Cards, Attack Maps & Alerts     │
   │                 (http://localhost:5601)                 │
   └─────────────────────────────────────────────────────────┘
```

---

## 2. Architecture & Design Rationale

| Component | Technology | Why Selected over Alternatives |
|---|---|---|
| **Honeypot** | Cowrie | Medium-interaction SSH/Telnet honeypot that logs full interactive command input, credentials attempted, client SSH banners, and HSSAH fingerprints in structured JSON. |
| **Log Shipper** | Filebeat | Lightweight C/Go daemon that streams NDJSON directly to Elasticsearch with minimal memory overhead (<50MB vs Logstash's 1GB+ JVM footprint). |
| **Storage & Indexing** | Elasticsearch 8.x | High-performance distributed search engine with schema-on-write mapping for instant aggregation across millions of log records. |
| **Visualization** | Kibana 8.x | Native analytics dashboard with automated Data Views and saved searches for security analysts. |
| **ML Engine** | Isolation Forest (scikit-learn) | Unsupervised anomaly detection operating in linear time $O(n)$. Detects novel attacks without needing labeled training data. |

---

## 3. Machine Learning Detection Pipeline

### Feature Engineering (Session-Level Aggregation)
Raw honeypot events are grouped by unique `session` ID into behavioral vectors:
1. **`login_attempts_per_min`**: Velocity of authentication attempts. Differentiates rapid automated bots (e.g. 50 attempts/min) from human operators (0.5 attempts/min).
2. **`unique_usernames`**: Number of distinct usernames targeted (detects dictionary spray attacks).
3. **`session_duration`**: Total duration of connection in seconds.
4. **`command_count`**: Number of interactive terminal commands entered post-authentication.

### Dual-Tier Detection Architecture
```
Session Stream
      │
      ├──▶ [Tier 1: Rule Pre-Filter] ──(High failed rate / Spray)──▶ [CRITICAL Alert]
      │                                                                    ▲
      └──▶ [Tier 2: Isolation Forest] ──(Anomaly Score > 0.60)─────────────┘
                                    └──(Normal Score < 0.60)──────────────▶ [BENIGN Session]
```

1. **Tier 1 (Rule-Based Pre-filter):** Instantly flags high-velocity brute-force ($\ge 8\text{ logins/min}$ with $\ge 5$ failures) or multi-user spraying ($\ge 4$ unique usernames) with zero latency.
2. **Tier 2 (Isolation Forest):** Isolates anomalies by constructing an ensemble of random isolation trees. Shorter path lengths in the trees directly correspond to anomalous behavior in multi-dimensional feature space.

---

## 4. Quickstart & Deployment

### Prerequisites
- Docker & Docker Compose (v2.0+)
- Python 3.10+

### Step 1: Clone & Install Python Dependencies
```bash
git clone https://github.com/OjasPurohit/athena.git
cd athena
pip install -r requirements.txt
```

### Step 2: Start the Athena SOC Stack
```bash
docker compose up -d
```
Verify all 4 containers are running:
```bash
docker compose ps
```

### Step 3: Initialize Kibana Data Views & Dashboard
```bash
python scripts/setup_kibana.py
```
Open Kibana in your browser: **[http://localhost:5601](http://localhost:5601)**

### Step 4: Run the ML Anomaly Detection Daemon
In a separate terminal, launch the detection engine:
```bash
# Periodic continuous scoring (every 15 seconds)
python ml/anomaly_detector.py --daemon --interval 15
```

### Step 5: Launch the Real-Time SOC Terminal (FastAPI + React)
Launch the presentation-layer SOC interface:

```bash
# 1. Start the FastAPI backend (Terminal 1)
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

# 2. Start the React Frontend Dashboard (Terminal 2)
cd dashboard
npm run dev
```

Open the SOC Terminal in your browser: **[http://localhost:5173](http://localhost:5173)**  
FastAPI Swagger Docs: **[http://localhost:8000/docs](http://localhost:8000/docs)**

---

## 5. Testing & Validation

### Automated End-to-End Test
Run the comprehensive test runner to verify closed-loop telemetry and measure detection latency:
```bash
python scripts/test_pipeline.py
```

### Simulating Attacks with the Traffic Generator
Simulate different attacker tool profiles against the honeypot:

```bash
# 1. Hydra-style Brute-Force Password Spray
python scripts/simulate_attack.py --mode brute-force --attempts 15

# 2. Multi-Username Credential Spray
python scripts/simulate_attack.py --mode spray

# 3. Benign Human Admin Session
python scripts/simulate_attack.py --mode benign

# 4. Run all scenarios
python scripts/simulate_attack.py --mode all
```

---

## 6. Viva Defense Cheat Sheet

### Top 10 Viva Questions & Answers

1. **Q: Why use Cowrie over a low-interaction honeypot like Dionaea?**  
   *A:* Cowrie provides medium-interaction SSH/Telnet emulation. Attackers actually receive a fake Linux shell, allowing us to capture post-exploitation commands, downloaded malware URLs, and session duration — critical features for ML anomaly scoring.

2. **Q: Why Filebeat instead of Logstash?**  
   *A:* Cowrie outputs native structured JSON. Filebeat's NDJSON parser handles extraction directly with minimal CPU and memory overhead (<50MB vs Logstash requiring a 1GB+ JVM).

3. **Q: Why Isolation Forest instead of Supervised ML (e.g., Random Forest / XGBoost)?**  
   *A:* Supervised models require labeled datasets (e.g. NSL-KDD) which suffer from concept drift and cannot detect zero-day attacks. Isolation Forest is unsupervised and requires no labeled attack data.

4. **Q: How does Isolation Forest mathematically isolate anomalies?**  
   *A:* It recursively partitions data points with random splits. Because anomalies have extreme or unusual feature values, they are isolated in fewer splits, resulting in shorter average path lengths $h(x)$ across the ensemble of $iTrees$.

5. **Q: What does the contamination parameter represent?**  
   *A:* Contamination represents the expected proportion of outliers/anomalies in the training dataset (we tuned it to $0.08$ or 8% based on expected honeypot background noise).

6. **Q: Why do we have a Rule Pre-filter before the ML model?**  
   *A:* Defense-in-depth: High-velocity brute-force attacks have well-defined signatures. The rule pre-filter handles obvious attacks instantaneously, saving compute resources and reducing ML false negative risks.

7. **Q: How do you prevent division by zero in session duration calculations?**  
   *A:* In `aggregate_sessions()`, we clamp the minimum duration to `1.0` second (`max(duration, 1.0)`).

8. **Q: How does Elasticsearch index session documents?**  
   *A:* Raw Cowrie events land in time-series indices `cowrie-logs-YYYY.MM.DD`. Our detector aggregates these by `session_id` and upserts structured documents into `athena-sessions` and `athena-alerts`.

9. **Q: What is the end-to-end detection latency?**  
   *A:* The latency from attack packet injection to Kibana dashboard alert is typically under 5-10 seconds (governed by Filebeat's buffer flush and the detector's polling interval).

10. **Q: How can this platform scale in production?**  
    *A:* In production, Cowrie sensors can be deployed across distributed edge networks, forwarding logs via Filebeat over TLS with mutual authentication to an Elasticsearch cluster.

11. **Q: How does data flow from Elasticsearch to the React SOC Dashboard in real-time?**  
    *A:* A background `asyncio` task in the FastAPI service (`api/main.py`) polls Elasticsearch indices (`cowrie-logs-*`, `athena-sessions`, `athena-alerts`) every 3 seconds off the main thread using `asyncio.to_thread`. It constructs a structured telemetry snapshot and pushes it over a WebSocket connection (`ws://localhost:8000/ws/live`) to all active React clients, which update their UI state atomically via a React `useReducer` store.

12. **Q: Why use WebSockets instead of short polling or Server-Sent Events (SSE) for the SOC Dashboard?**  
    *A:* WebSockets establish a single bi-directional TCP connection. The backend manages the push cadence centrally so multiple browser clients share a single backend ES query cycle, avoiding repeated HTTP header overhead and race conditions during active attack bursts.