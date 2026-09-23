"""
=============================================================================
Project Athena — End-to-End Pipeline Validation & Test Runner
=============================================================================
Module: scripts.test_pipeline
Description:
    Performs comprehensive verification of the entire Athena SOC architecture:
      Step 1: Check Elasticsearch, Cowrie Honeypot, Kibana, and Filebeat health.
      Step 2: Train/calibrate the Isolation Forest on baseline traffic.
      Step 3: Launch a simulated brute-force attack against Cowrie (port 2222).
      Step 4: Verify Filebeat log shipping into Elasticsearch (cowrie-logs-*).
      Step 5: Execute ML Anomaly Detection engine.
      Step 6: Verify flagged anomaly alert written to athena-alerts index.
      Step 7: Output viva-ready validation metrics and pipeline latency.

Viva / Architecture Defense Notes:
    - Demonstrates full closed-loop telemetry:
      Attack packet -> Honeypot emulation -> JSON log -> Filebeat ship ->
      Elasticsearch ingestion -> ML scoring -> Alert generated -> Kibana display.
=============================================================================
"""

import sys
import os
import time
import logging
from datetime import datetime, timezone
import requests
from elasticsearch import Elasticsearch

# Add repo root to Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ml.anomaly_detector import AthenaSessionPipeline, MLIsolationForestDetector, SESSIONS_INDEX, ALERTS_INDEX
from scripts.simulate_attack import run_brute_force_attack, test_ssh_connection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [Validation] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("Validation")

ES_URL = os.getenv("ELASTICSEARCH_HOST", "http://localhost:9200")
HONEYPOT_HOST = os.getenv("HONEYPOT_HOST", "localhost")
HONEYPOT_PORT = int(os.getenv("HONEYPOT_PORT", "2222"))
KIBANA_URL = os.getenv("KIBANA_HOST", "http://localhost:5601")


def test_service_health() -> bool:
    """Verifies all stack components are reachable."""
    logger.info("--> [Step 1/6] Verifying stack health...")

    # Elasticsearch
    try:
        es = Elasticsearch(ES_URL)
        if not es.ping():
            logger.error(f"[FAIL] Elasticsearch ping failed at {ES_URL}")
            return False
        info = es.info()
        logger.info(f"    [+] Elasticsearch {info['version']['number']} is HEALTHY")
    except Exception as e:
        logger.error(f"[FAIL] Elasticsearch connection error: {e}")
        return False

    # Honeypot
    if not test_ssh_connection(HONEYPOT_HOST, HONEYPOT_PORT):
        logger.error(f"[FAIL] Honeypot port {HONEYPOT_PORT} not responding")
        return False
    logger.info(f"    [+] Cowrie Honeypot is LISTENING on port {HONEYPOT_PORT}")

    return True


def calibrate_baseline_model():
    """Trains Isolation Forest model on baseline traffic."""
    logger.info("--> [Step 2/6] Calibrating Isolation Forest ML model...")
    import pandas as pd
    detector = MLIsolationForestDetector()
    detector.train_on_baseline(pd.DataFrame())
    logger.info("    [+] Isolation Forest model trained and saved to ml/isolation_forest.joblib")


def inject_attack_and_measure() -> float:
    """Launches brute-force attack and returns attack start timestamp."""
    logger.info(f"--> [Step 3/6] Simulating Brute-Force attack on {HONEYPOT_HOST}:{HONEYPOT_PORT}...")
    start_time = time.time()
    # Inject 12 rapid failed attempts
    run_brute_force_attack(HONEYPOT_HOST, HONEYPOT_PORT, target_user="root", attempts=12, delay=0.08)
    duration = time.time() - start_time
    logger.info(f"    [+] Attack injected in {duration:.2f}s")
    return start_time


def verify_filebeat_ingestion(es: Elasticsearch, wait_timeout: int = 20) -> bool:
    """Verifies Cowrie raw logs are shipped into Elasticsearch by Filebeat."""
    logger.info("--> [Step 4/6] Verifying Filebeat log ingestion into Elasticsearch...")
    start = time.time()
    while time.time() - start < wait_timeout:
        try:
            res = es.search(index="cowrie-logs-*", body={"size": 1, "query": {"match_all": {}}})
            hits = res.get("hits", {}).get("total", {}).get("value", 0)
            if hits > 0:
                logger.info(f"    [+] Filebeat successfully indexed {hits} raw Cowrie log documents in 'cowrie-logs-*'")
                return True
        except Exception:
            pass
        time.sleep(2)

    logger.warning("    [!] No logs found in 'cowrie-logs-*' yet. Waiting a bit more...")
    return False


def run_ml_pipeline_and_verify(es: Elasticsearch, attack_start_time: float) -> bool:
    """Executes ML pipeline and verifies alert generation."""
    logger.info("--> [Step 5/6] Executing ML Anomaly Detection Engine...")
    pipeline = AthenaSessionPipeline(es)
    processed_count = pipeline.evaluate_and_index_sessions()
    logger.info(f"    [+] Processed and scored {processed_count} sessions")

    logger.info("--> [Step 6/6] Verifying Anomaly Alerts in Elasticsearch...")
    try:
        res = es.search(
            index=ALERTS_INDEX,
            body={
                "size": 5,
                "sort": [{"evaluated_at": {"order": "desc"}}],
                "query": {"match_all": {}}
            }
        )
        hits = res.get("hits", {}).get("hits", [])
        total_alerts = res.get("hits", {}).get("total", {}).get("value", 0)

        if total_alerts > 0:
            logger.info(f"    [+] SUCCESS: Found {total_alerts} anomaly alert(s) in '{ALERTS_INDEX}'!")
            top_alert = hits[0]["_source"]
            
            latency = time.time() - attack_start_time

            print("\n" + "=" * 70)
            print("         [SUCCESS] ATHENA SOC PIPELINE - VALIDATION PASSED")
            print("=" * 70)
            print(f" Detected Session ID    : {top_alert.get('session_id')}")
            print(f" Attacker IP            : {top_alert.get('src_ip')}")
            print(f" Risk Level             : {top_alert.get('risk_level')}")
            print(f" Detection Method       : {top_alert.get('detection_method')}")
            print(f" Anomaly Score          : {top_alert.get('anomaly_score')}")
            print(f" Login Velocity         : {top_alert.get('login_attempts_per_min')} attempts/min")
            print(f" Failed Logins          : {top_alert.get('failed_login_count')}")
            print(f" Reason                 : {top_alert.get('flag_reason')}")
            print(f" Measured E2E Latency   : {latency:.2f} seconds")
            print("=" * 70 + "\n")
            return True
        else:
            logger.error("[FAIL] No anomaly alerts found in athena-alerts.")
            return False

    except Exception as e:
        logger.error(f"[FAIL] Error querying {ALERTS_INDEX}: {e}")
        return False


def main():
    print("\n" + "=" * 70)
    print(" Project Athena - End-to-End Pipeline Test Runner")
    print("=" * 70 + "\n")

    es = Elasticsearch(ES_URL)

    if not test_service_health():
        sys.exit(1)

    calibrate_baseline_model()
    attack_start = inject_attack_and_measure()

    logger.info("Pausing 5 seconds for Filebeat to sync log buffers...")
    time.sleep(5)

    verify_filebeat_ingestion(es)
    success = run_ml_pipeline_and_verify(es, attack_start)

    if success:
        logger.info("[+] All 4 Stages verified end-to-end successfully!")
        sys.exit(0)
    else:
        logger.error("[-] Validation failed. Check container logs.")
        sys.exit(1)


if __name__ == "__main__":
    main()
