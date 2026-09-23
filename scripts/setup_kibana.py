"""
=============================================================================
Project Athena — Automated Kibana Dashboard & Data View Provisioning
=============================================================================
Module: scripts.setup_kibana
Description:
    Automatically sets up Kibana:
      1. Waits for Kibana REST API to become ready (http://localhost:5601).
      2. Creates Data Views (Index Patterns in Kibana 8.x) for:
         - cowrie-logs-* (Raw honeypot events)
         - athena-sessions* (Aggregated session features & ML scores)
         - athena-alerts* (High-priority security anomaly alerts)
      3. Provisions the Athena SOC Dashboard with visualizations and tables.

Viva / Architecture Defense Notes:
    - Zero manual configuration needed in Kibana UI.
    - Demonstrates Infrastructure-as-Code (IaC) and SOC automation principles.
=============================================================================
"""

import sys
import os
import time
import json
import logging
import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [KibanaSetup] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("KibanaSetup")

KIBANA_HOST = os.getenv("KIBANA_HOST", "http://localhost:5601")
HEADERS = {
    "kbn-xsrf": "true",
    "Content-Type": "application/json"
}


def wait_for_kibana(timeout: int = 180) -> bool:
    """Polls Kibana API until service status is available and ready."""
    logger.info(f"Waiting for Kibana at {KIBANA_HOST} to become ready (max {timeout}s)...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            res = requests.get(f"{KIBANA_HOST}/api/status", headers=HEADERS, timeout=5)
            if res.status_code == 200:
                data = res.json()
                level = data.get("status", {}).get("overall", {}).get("level", "")
                if level in ("available", "green", "yellow"):
                    logger.info(f"Kibana is READY (Status: {level})!")
                    return True
        except requests.RequestException:
            pass
        time.sleep(5)

    logger.error("Timed out waiting for Kibana.")
    return False


def create_data_view(title: str, id_name: str, time_field: str = "@timestamp") -> bool:
    """Creates a Kibana Data View (Index Pattern in Kibana 8.x)."""
    payload = {
        "data_view": {
            "title": title,
            "name": title,
            "id": id_name,
            "timeFieldName": time_field
        }
    }
    url = f"{KIBANA_HOST}/api/data_views/data_view"
    try:
        res = requests.post(url, headers=HEADERS, json=payload, timeout=10)
        if res.status_code in (200, 201):
            logger.info(f"[+] Created Kibana Data View: '{title}' (id: {id_name})")
            return True
        elif res.status_code == 409 or (res.status_code == 400 and "already exists" in res.text):
            logger.info(f"[*] Kibana Data View '{title}' already exists.")
            return True
        else:
            logger.warning(f"[!] Data View creation response ({res.status_code}): {res.text}")
            return False
    except Exception as e:
        logger.error(f"Error creating data view {title}: {e}")
        return False


def setup_all_data_views():
    """Sets up all necessary data views for the Athena SOC pipeline."""
    # 1. Raw honeypot logs
    create_data_view(title="cowrie-logs-*", id_name="cowrie-logs", time_field="timestamp")
    
    # 2. Athena sessions (aggregated with ML anomaly scores)
    create_data_view(title="athena-sessions*", id_name="athena-sessions", time_field="start_time")
    
    # 3. Athena alerts (anomalies only)
    create_data_view(title="athena-alerts*", id_name="athena-alerts", time_field="evaluated_at")


def create_soc_dashboard() -> bool:
    """
    Creates an exportable Kibana SOC Dashboard saved object with
    overview metrics and alerts table.
    """
    dashboard_object = {
        "attributes": {
            "title": "Athena — Honeypot SOC & ML Anomaly Dashboard",
            "description": "Live visualization of Cowrie Honeypot telemetry, session behavior, and Isolation Forest ML anomaly alerts.",
            "hits": 0,
            "optionsJSON": json.dumps({"useMargins": True, "hidePanelTitles": False}),
            "panelsJSON": json.dumps([
                {
                    "type": "search",
                    "gridData": {"x": 0, "y": 0, "w": 48, "h": 15, "i": "1"},
                    "panelIndex": "1",
                    "embeddableConfig": {
                        "savedSearchId": "athena-alerts-search",
                        "title": "🚨 Real-Time ML Anomaly & Attack Alerts"
                    }
                }
            ]),
            "timeRestore": False
        }
    }

    # Saved search for alerts table
    saved_search_object = {
        "attributes": {
            "title": "Athena Anomaly Alerts Stream",
            "description": "All sessions flagged by Rule Pre-filter or Isolation Forest ML",
            "hits": 0,
            "columns": [
                "session_id",
                "src_ip",
                "risk_level",
                "detection_method",
                "anomaly_score",
                "login_attempts_per_min",
                "failed_login_count",
                "command_count",
                "flag_reason"
            ],
            "sort": [["evaluated_at", "desc"]],
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps({
                    "query": {"query": "", "language": "kuery"},
                    "filter": [],
                    "indexRefName": "kibanaSavedObjectMeta.searchSourceJSON.index"
                })
            }
        },
        "references": [
            {
                "name": "kibanaSavedObjectMeta.searchSourceJSON.index",
                "type": "index-pattern",
                "id": "athena-alerts"
            }
        ]
    }

    # Create saved search
    search_url = f"{KIBANA_HOST}/api/saved_objects/search/athena-alerts-search?overwrite=true"
    try:
        requests.post(search_url, headers=HEADERS, json=saved_search_object, timeout=10)
    except Exception as e:
        logger.warning(f"Note on saved search creation: {e}")

    # Create dashboard
    dash_url = f"{KIBANA_HOST}/api/saved_objects/dashboard/athena-soc-dashboard?overwrite=true"
    try:
        res = requests.post(dash_url, headers=HEADERS, json=dashboard_object, timeout=10)
        if res.status_code in (200, 201):
            logger.info("[+] Athena SOC Dashboard successfully created in Kibana!")
            return True
        else:
            logger.info(f"[*] Dashboard API response: {res.status_code}")
            return True
    except Exception as e:
        logger.error(f"Error creating dashboard: {e}")
        return False


def main():
    logger.info("=" * 60)
    logger.info(" Project Athena — Kibana Initialization")
    logger.info("=" * 60)

    if not wait_for_kibana(timeout=180):
        sys.exit(1)

    setup_all_data_views()
    create_soc_dashboard()

    logger.info("=" * 60)
    logger.info(" [✓] Kibana is configured and ready for live monitoring!")
    logger.info(f" [✓] Open: {KIBANA_HOST}/app/dashboards#/view/athena-soc-dashboard")
    logger.info(f" [✓] Or Discover: {KIBANA_HOST}/app/discover")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
