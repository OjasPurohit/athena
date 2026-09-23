"""
=============================================================================
Project Athena — Self-Hosted SOC: ML Anomaly Detection Engine
=============================================================================
Module: ml.anomaly_detector
Description:
    This module implements a dual-tier anomaly detection pipeline:
      1. Tier 1 (Rule-Based Pre-filter): Heuristic thresholding on failed
         login rates and dictionary spray attempts to immediately catch
         high-velocity attacks without waiting for ML inference.
      2. Tier 2 (Unsupervised Isolation Forest): Scikit-learn Isolation Forest
         trained on session-level behavioral features (login rate, username
         diversity, session duration, command count) to detect novel,
         stealthy, or anomalous intrusion patterns.

Viva / Architecture Defense Notes:
    - Why Isolation Forest?
      Unlike density/distance-based algorithms (like KNN or DBSCAN) which
      have O(n^2) complexity, Isolation Forest runs in O(n) linear time.
      It isolates anomalies by randomly selecting a feature and split value.
      Because anomalies are "few and different", they require significantly
      fewer recursive splits (shorter tree paths) to isolate than normal data points.
    - Feature Engineering:
      1. login_attempts_per_min: Differentiates automated bots (high rate)
         from human operators (low rate).
      2. unique_usernames: Captures dictionary attacks & credential stuffing.
      3. session_duration: Anomalous sessions are either very short (rapid drop)
         or unusually prolonged.
      4. command_count: Flags post-exploitation activity after honeypot compromise.
=============================================================================
"""

import sys
import os
import time
import argparse
import logging
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Any, Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib
from elasticsearch import Elasticsearch, helpers

# ---------------------------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("AthenaDetector")

# Default settings
DEFAULT_ES_HOST = os.getenv("ELASTICSEARCH_HOST", "http://localhost:9200")
COWRIE_INDEX_PATTERN = "cowrie-logs-*"
SESSIONS_INDEX = "athena-sessions"
ALERTS_INDEX = "athena-alerts"
MODEL_FILE_PATH = os.path.join(os.path.dirname(__file__), "isolation_forest.joblib")

# Feature columns used for ML training and inference
FEATURE_COLUMNS = [
    "login_attempts_per_min",  # Velocity of authentication attempts
    "unique_usernames",        # Credential spray diversity
    "session_duration",        # Total connection lifespan (seconds)
    "command_count"            # Post-auth interactive terminal activity
]


class RulePrefilter:
    """
    Tier 1: Lightweight Rule-Based Pre-filter
    Catches aggressive brute-force attacks and high-velocity scans before ML scoring.
    """
    def __init__(
        self,
        failed_login_rate_threshold: float = 8.0,  # >8 failed logins/min
        failed_login_count_threshold: int = 5,      # >=5 failed logins total
        unique_usernames_threshold: int = 4         # >=4 distinct usernames (spray)
    ):
        self.failed_login_rate_threshold = failed_login_rate_threshold
        self.failed_login_count_threshold = failed_login_count_threshold
        self.unique_usernames_threshold = unique_usernames_threshold

    def evaluate(self, session_data: Dict[str, Any]) -> Tuple[bool, Optional[str], str]:
        """
        Evaluate session metrics against rule thresholds.
        Returns: (is_flagged, flag_reason, risk_level)
        """
        failed_logins = session_data.get("failed_login_count", 0)
        login_rate = session_data.get("login_attempts_per_min", 0.0)
        unique_users = session_data.get("unique_usernames", 0)

        # Rule 1: High failed login rate (Brute-Force signature)
        if failed_logins >= self.failed_login_count_threshold and login_rate >= self.failed_login_rate_threshold:
            reason = f"High failed login rate ({login_rate:.1f}/min with {failed_logins} failed attempts)"
            return True, reason, "CRITICAL"

        # Rule 2: Multi-user dictionary / credential spray attack
        if unique_users >= self.unique_usernames_threshold:
            reason = f"Credential spray detected ({unique_users} distinct usernames targeted)"
            return True, reason, "HIGH"

        return False, None, "LOW"


class MLIsolationForestDetector:
    """
    Tier 2: Unsupervised Isolation Forest Anomaly Detection
    """
    def __init__(
        self,
        model_path: str = MODEL_FILE_PATH,
        contamination: float = 0.08,
        n_estimators: int = 150,
        random_state: int = 42
    ):
        self.model_path = model_path
        self.contamination = contamination
        self.n_estimators = n_estimators
        self.random_state = random_state
        self.model: Optional[IsolationForest] = None
        self.load_or_init_model()

    def load_or_init_model(self):
        """Loads saved model if available; otherwise initializes a new instance."""
        if os.path.exists(self.model_path):
            try:
                self.model = joblib.load(self.model_path)
                logger.info(f"Loaded existing Isolation Forest model from {self.model_path}")
            except Exception as e:
                logger.warning(f"Could not load model ({e}), initializing fresh model.")
                self._create_fresh_model()
        else:
            self._create_fresh_model()

    def _create_fresh_model(self):
        self.model = IsolationForest(
            n_estimators=self.n_estimators,
            contamination=self.contamination,
            max_samples="auto",
            random_state=self.random_state,
            n_jobs=-1
        )

    def train_on_baseline(self, df_features: pd.DataFrame):
        """
        Fits the Isolation Forest on baseline (benign) session features and saves to disk.
        """
        if df_features.empty or len(df_features) < 10:
            logger.warning("Insufficient baseline data provided. Generating synthetic baseline calibration...")
            df_features = self.generate_synthetic_baseline(sample_count=200)

        X = df_features[FEATURE_COLUMNS].values
        self.model.fit(X)
        joblib.dump(self.model, self.model_path)
        logger.info(f"Trained Isolation Forest on {len(df_features)} baseline samples and saved to {self.model_path}")

    @staticmethod
    def generate_synthetic_baseline(sample_count: int = 200) -> pd.DataFrame:
        """
        Generates realistic baseline SSH session features representing normal admin/user behavior:
          - 1 (or rarely 2) login attempts
          - Low login rate (< 2 attempts/min)
          - 1 unique username (e.g. root/admin)
          - Session duration between 20s and 300s
          - Command count between 1 and 20
        """
        np.random.seed(42)
        durations = np.random.uniform(20.0, 300.0, size=sample_count)
        login_attempts = np.random.choice([1, 2], size=sample_count, p=[0.92, 0.08])
        rates = (login_attempts / durations) * 60.0
        unique_users = np.ones(sample_count, dtype=int)
        commands = np.random.poisson(lam=5, size=sample_count) + 1

        data = {
            "login_attempts_per_min": rates,
            "unique_usernames": unique_users,
            "session_duration": durations,
            "command_count": commands
        }
        return pd.DataFrame(data)

    def score_session(self, session_features: Dict[str, Any]) -> Tuple[bool, float, str]:
        """
        Scores a single session feature dictionary using the trained Isolation Forest.
        Returns: (is_anomaly, anomaly_score_0_to_1, risk_level)
        """
        if self.model is None or not hasattr(self.model, "estimators_"):
            logger.info("Model not yet trained. Auto-calibrating with baseline...")
            self.train_on_baseline(pd.DataFrame())

        X = np.array([[
            float(session_features.get("login_attempts_per_min", 0.0)),
            float(session_features.get("unique_usernames", 1)),
            float(session_features.get("session_duration", 1.0)),
            float(session_features.get("command_count", 0))
        ]])

        # Decision function: negative values indicate anomalies, positive normal
        raw_score = self.model.decision_function(X)[0]
        prediction = self.model.predict(X)[0]  # -1 = anomaly, 1 = normal

        # Convert raw decision score to normalized 0.0 - 1.0 anomaly metric (higher = more anomalous)
        # Decision function is typically between -0.5 (most anomalous) and 0.5 (most normal)
        normalized_score = float(np.clip(0.5 - raw_score, 0.0, 1.0))

        is_anomaly = bool(prediction == -1 or normalized_score > 0.60)
        
        if normalized_score >= 0.75:
            risk = "CRITICAL"
        elif normalized_score >= 0.60:
            risk = "HIGH"
        elif normalized_score >= 0.45:
            risk = "MEDIUM"
        else:
            risk = "LOW"

        return is_anomaly, normalized_score, risk


class AthenaSessionPipeline:
    """
    Orchestrates session data aggregation from Cowrie raw logs, executes
    rule + ML anomaly detection, and writes results back into Elasticsearch.
    """
    def __init__(self, es_client: Elasticsearch):
        self.es = es_client
        self.rule_filter = RulePrefilter()
        self.ml_detector = MLIsolationForestDetector()
        self._ensure_indices_exist()

    def _ensure_indices_exist(self):
        """Creates target Elasticsearch index mappings for structured Athena sessions & alerts."""
        session_mapping = {
            "mappings": {
                "properties": {
                    "session_id": {"type": "keyword"},
                    "src_ip": {"type": "ip"},
                    "start_time": {"type": "date"},
                    "end_time": {"type": "date"},
                    "session_duration": {"type": "float"},
                    "login_attempts": {"type": "integer"},
                    "failed_login_count": {"type": "integer"},
                    "success_login_count": {"type": "integer"},
                    "login_attempts_per_min": {"type": "float"},
                    "unique_usernames": {"type": "integer"},
                    "unique_passwords": {"type": "integer"},
                    "command_count": {"type": "integer"},
                    "commands_list": {"type": "keyword"},
                    "usernames_list": {"type": "keyword"},
                    "is_anomaly": {"type": "boolean"},
                    "anomaly_score": {"type": "float"},
                    "detection_method": {"type": "keyword"},
                    "flag_reason": {"type": "text"},
                    "risk_level": {"type": "keyword"},
                    "evaluated_at": {"type": "date"}
                }
            }
        }

        for idx in [SESSIONS_INDEX, ALERTS_INDEX]:
            try:
                if not self.es.indices.exists(index=idx):
                    self.es.indices.create(index=idx, body=session_mapping)
                    logger.info(f"Created Elasticsearch index: {idx}")
            except Exception as e:
                logger.warning(f"Index check/creation warning for {idx}: {e}")

    def fetch_raw_cowrie_events(self, max_events: int = 5000) -> List[Dict[str, Any]]:
        """Pulls raw Cowrie JSON log events from cowrie-logs-* index."""
        try:
            query = {
                "size": max_events,
                "sort": [{"timestamp": {"order": "asc", "unmapped_type": "date"}}],
                "query": {"match_all": {}}
            }
            res = self.es.search(index=COWRIE_INDEX_PATTERN, body=query)
            hits = res.get("hits", {}).get("hits", [])
            events = [hit["_source"] for hit in hits if "_source" in hit and "session" in hit["_source"]]
            return events
        except Exception as e:
            logger.warning(f"Error querying {COWRIE_INDEX_PATTERN}: {e}")
            return []

    def aggregate_sessions(self, raw_events: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """
        Groups raw Cowrie event logs by session ID and extracts behavioral features.
        """
        sessions: Dict[str, Dict[str, Any]] = {}

        for event in raw_events:
            sess_id = event.get("session")
            if not sess_id:
                continue

            if sess_id not in sessions:
                sessions[sess_id] = {
                    "session_id": sess_id,
                    "src_ip": event.get("src_ip", "0.0.0.0"),
                    "timestamps": [],
                    "failed_login_count": 0,
                    "success_login_count": 0,
                    "usernames": set(),
                    "passwords": set(),
                    "commands": []
                }

            s = sessions[sess_id]
            ts_str = event.get("timestamp")
            if ts_str:
                try:
                    # Clean ISO format
                    dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                    s["timestamps"].append(dt)
                except Exception:
                    pass

            eventid = event.get("eventid", "")
            if eventid == "cowrie.login.failed":
                s["failed_login_count"] += 1
                if "username" in event:
                    s["usernames"].add(event["username"])
                if "password" in event:
                    s["passwords"].add(event["password"])

            elif eventid == "cowrie.login.success":
                s["success_login_count"] += 1
                if "username" in event:
                    s["usernames"].add(event["username"])
                if "password" in event:
                    s["passwords"].add(event["password"])

            elif eventid in ("cowrie.command.input", "cowrie.command.failed"):
                # Filebeat overwrites the native 'input' field with {"type": "log"} metadata.
                # The actual command text is preserved in 'message' as 'CMD: <command>'.
                # We try 'input' first (native Cowrie JSON direct write), then fall back
                # to extracting from 'message' when Filebeat has overwritten 'input'.
                raw_input = event.get("input", "")
                if isinstance(raw_input, str) and raw_input:
                    cmd = raw_input
                else:
                    # Extract from message field: "CMD: whoami" -> "whoami"
                    msg = event.get("message", "")
                    if isinstance(msg, str) and msg.startswith("CMD: "):
                        cmd = msg[5:].strip()
                    else:
                        cmd = msg
                if cmd:
                    s["commands"].append(cmd)

            # Update src_ip if available
            if "src_ip" in event and event["src_ip"]:
                s["src_ip"] = event["src_ip"]

        # Compute summary metrics for each session
        compiled_sessions = {}
        for sess_id, s in sessions.items():
            if not s["timestamps"]:
                start_dt = datetime.now(timezone.utc)
                end_dt = start_dt
                duration = 1.0
            else:
                s["timestamps"].sort()
                start_dt = s["timestamps"][0]
                end_dt = s["timestamps"][-1]
                duration = max((end_dt - start_dt).total_seconds(), 1.0)

            total_logins = s["failed_login_count"] + s["success_login_count"]
            login_rate = (total_logins / duration) * 60.0

            compiled_sessions[sess_id] = {
                "session_id": sess_id,
                "src_ip": s["src_ip"],
                "start_time": start_dt.isoformat(),
                "end_time": end_dt.isoformat(),
                "session_duration": round(duration, 2),
                "login_attempts": total_logins,
                "failed_login_count": s["failed_login_count"],
                "success_login_count": s["success_login_count"],
                "login_attempts_per_min": round(login_rate, 2),
                "unique_usernames": max(len(s["usernames"]), 1 if total_logins > 0 else 0),
                "unique_passwords": len(s["passwords"]),
                "command_count": len(s["commands"]),
                "commands_list": s["commands"][:50],
                "usernames_list": list(s["usernames"])[:50]
            }

        return compiled_sessions

    def evaluate_and_index_sessions(self) -> int:
        """
        Fetches events, aggregates sessions, runs dual-tier detection,
        and writes enriched session documents and anomaly alerts into Elasticsearch.
        """
        raw_events = self.fetch_raw_cowrie_events()
        if not raw_events:
            logger.info("No raw Cowrie events found in Elasticsearch yet.")
            return 0

        sessions_dict = self.aggregate_sessions(raw_events)
        logger.info(f"Aggregated {len(sessions_dict)} distinct Cowrie sessions.")

        docs_to_index = []
        alerts_to_index = []
        current_time_iso = datetime.now(timezone.utc).isoformat()

        for sess_id, data in sessions_dict.items():
            # Tier 1: Rule Pre-Filter
            rule_flagged, rule_reason, rule_risk = self.rule_filter.evaluate(data)

            if rule_flagged:
                is_anomaly = True
                anomaly_score = 1.0
                detection_method = "RULE_PREFILTER"
                flag_reason = rule_reason
                risk_level = rule_risk
            else:
                # Tier 2: Unsupervised Isolation Forest
                ml_flagged, ml_score, ml_risk = self.ml_detector.score_session(data)
                is_anomaly = ml_flagged
                anomaly_score = round(ml_score, 4)
                if ml_flagged:
                    detection_method = "ISOLATION_FOREST"
                    flag_reason = f"ML Isolation Forest Anomaly (Score: {anomaly_score:.2f}, Risk: {ml_risk})"
                    risk_level = ml_risk
                else:
                    detection_method = "BENIGN"
                    flag_reason = "Normal behavioral baseline"
                    risk_level = "LOW"

            enriched_doc = {
                **data,
                "is_anomaly": is_anomaly,
                "anomaly_score": anomaly_score,
                "detection_method": detection_method,
                "flag_reason": flag_reason,
                "risk_level": risk_level,
                "evaluated_at": current_time_iso
            }

            docs_to_index.append({
                "_index": SESSIONS_INDEX,
                "_id": sess_id,
                "_source": enriched_doc
            })

            if is_anomaly:
                alerts_to_index.append({
                    "_index": ALERTS_INDEX,
                    "_id": f"alert-{sess_id}",
                    "_source": enriched_doc
                })

        # Bulk write to Elasticsearch
        if docs_to_index:
            success, _ = helpers.bulk(self.es, docs_to_index, refresh=True)
            logger.info(f"Indexed/updated {success} sessions in '{SESSIONS_INDEX}'.")

        if alerts_to_index:
            success_alerts, _ = helpers.bulk(self.es, alerts_to_index, refresh=True)
            logger.info(f"Indexed {success_alerts} anomaly alerts in '{ALERTS_INDEX}'!")

        return len(docs_to_index)

    def run_daemon(self, interval_seconds: int = 15):
        """Continuously runs anomaly scoring on a periodic timer."""
        logger.info(f"Starting Athena ML Anomaly Detection Daemon (Interval: {interval_seconds}s)...")
        while True:
            try:
                self.evaluate_and_index_sessions()
            except Exception as e:
                logger.error(f"Error during daemon evaluation loop: {e}")
            time.sleep(interval_seconds)


def main():
    parser = argparse.ArgumentParser(description="Athena SOC ML Anomaly Detector")
    parser.add_argument("--es-host", default=DEFAULT_ES_HOST, help="Elasticsearch URL")
    parser.add_argument("--train", action="store_true", help="Train baseline model on synthetic/normal traffic")
    parser.add_argument("--once", action="store_true", help="Run scoring once on current logs and exit")
    parser.add_argument("--daemon", action="store_true", help="Run continuously in daemon mode")
    parser.add_argument("--interval", type=int, default=15, help="Daemon poll interval in seconds")

    args = parser.parse_args()

    es = Elasticsearch(args.es_host)
    pipeline = AthenaSessionPipeline(es)

    if args.train:
        logger.info("Calibrating Isolation Forest on baseline data...")
        pipeline.ml_detector.train_on_baseline(pd.DataFrame())
        logger.info("Baseline training complete.")

    if args.daemon:
        pipeline.run_daemon(interval_seconds=args.interval)
    else:
        pipeline.evaluate_and_index_sessions()


if __name__ == "__main__":
    main()
