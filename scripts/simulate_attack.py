"""
=============================================================================
Project Athena — Honeypot Traffic & Attack Simulation Engine
=============================================================================
Module: scripts.simulate_attack
Description:
    Generates realistic SSH traffic against the Cowrie honeypot (port 2222)
    to test the entire Athena detection pipeline end-to-end:
      1. Brute-Force Attack (Hydra-style): High-velocity password guessing
         against a single target account ('root') over an SSH transport.
      2. Credential Spray Attack: Rapid testing of multiple distinct usernames
         with a common password over an SSH transport.
      3. Benign / Baseline Session: Legitimate sysadmin login (root:password)
         executing standard diagnostic shell commands before clean logout.

    Automatically triggers ML session aggregation & scoring in Elasticsearch
    upon completion so the SOC Dashboard updates immediately.
=============================================================================
"""

import sys
import os
import time
import socket
import argparse
import logging

import paramiko

# Ensure project root is on sys.path so we can invoke the ML evaluator directly
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [AttackSim] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("AttackSim")

# Wordlists for attack generation
# Note: 'root:password' is reserved for legitimate benign admin sessions.
# All entries below are rejected by Cowrie's userdb.txt policy (AUTH_FAIL).
SPRAY_USERNAMES = [
    "admin", "ubuntu", "oracle", "postgres", "test",
    "guest", "deploy", "git", "ftpuser", "support"
]

BRUTE_FORCE_PASSWORDS = [
    "123456", "root", "admin", "12345678", "toor",
    "qwerty", "secret", "pass123", "letmein", "welcome",
    "cisco", "password123", "iloveyou", "master", "dragon"
]

BENIGN_COMMANDS = [
    "whoami",
    "uname -a",
    "uptime",
    "ls -la /var/log",
    "cat /etc/os-release",
    "df -h"
]


def test_ssh_connection(host: str, port: int, timeout: float = 3.0) -> bool:
    """Checks if the Cowrie honeypot port is reachable."""
    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            banner = sock.recv(1024)
            logger.info(f"Honeypot reachable at {host}:{port} — Banner: {banner.decode('utf-8', errors='ignore').strip()}")
            return True
    except Exception as e:
        logger.error(f"Cannot reach honeypot at {host}:{port} — Error: {e}")
        return False


def run_brute_force_attack(host: str, port: int, target_user: str = "root", attempts: int = 12, delay: float = 0.08) -> dict:
    """
    Simulates high-velocity password brute-forcing (Hydra-style) over a single
    SSH transport so all failed attempts aggregate into a single attack session.
    """
    total = min(attempts, len(BRUTE_FORCE_PASSWORDS))
    logger.info(f"==> Launching BRUTE-FORCE Attack on {host}:{port} (User: '{target_user}', Attempts: {total})...")
    failures = 0
    successes = 0
    transport = None

    try:
        transport = paramiko.Transport((host, port))
        transport.connect()

        for i in range(total):
            pwd = BRUTE_FORCE_PASSWORDS[i]
            if not transport.is_active():
                transport.close()
                transport = paramiko.Transport((host, port))
                transport.connect()

            try:
                transport.auth_password(target_user, pwd)
                logger.info(f"  [{i+1}/{total}] [SUCCESS] {target_user}:{pwd}")
                successes += 1
            except paramiko.AuthenticationException:
                logger.info(f"  [{i+1}/{total}] [AUTH_FAIL] Rejected credential -> {target_user}:{pwd}")
                failures += 1
            except Exception as e:
                logger.warning(f"  [{i+1}/{total}] [ERROR] {e}")

            if delay > 0:
                time.sleep(delay)
    finally:
        if transport is not None:
            try:
                transport.close()
            except Exception:
                pass

    logger.info(f"[+] Brute-force attack finished: {failures} failed attempts, {successes} accepted.")
    return {"mode": "brute-force", "failures": failures, "successes": successes}


def run_credential_spray(host: str, port: int, password: str = "password123", delay: float = 0.08) -> dict:
    """
    Simulates multi-username credential spraying over a single SSH transport
    so all distinct usernames aggregate into a single spray session.
    """
    total = len(SPRAY_USERNAMES)
    logger.info(f"==> Launching CREDENTIAL SPRAY Attack on {host}:{port} ({total} distinct usernames)...")
    failures = 0
    transport = None

    try:
        transport = paramiko.Transport((host, port))
        transport.connect()

        for i, user in enumerate(SPRAY_USERNAMES):
            if not transport.is_active():
                transport.close()
                transport = paramiko.Transport((host, port))
                transport.connect()

            try:
                transport.auth_password(user, password)
                logger.info(f"  [{i+1}/{total}] [SUCCESS] {user}:{password}")
            except paramiko.AuthenticationException:
                logger.info(f"  [{i+1}/{total}] [AUTH_FAIL] Spray rejected -> {user}:{password}")
                failures += 1
            except Exception as e:
                logger.warning(f"  [{i+1}/{total}] [ERROR] {e}")

            if delay > 0:
                time.sleep(delay)
    finally:
        if transport is not None:
            try:
                transport.close()
            except Exception:
                pass

    logger.info(f"[+] Credential spray finished: {failures} usernames rejected.")
    return {"mode": "spray", "failures": failures, "usernames_tested": total}


def run_benign_session(host: str, port: int, username: str = "root", password: str = "password") -> dict:
    """
    Simulates a legitimate human sysadmin SSH session:
      - Authenticates cleanly with root:password
      - Opens an interactive PTY shell
      - Executes 6 standard diagnostic commands
      - Logs out cleanly
    """
    logger.info(f"==> Running BENIGN Sysadmin Session on {host}:{port} (User: '{username}')...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cmds_run = 0

    try:
        client.connect(
            hostname=host,
            port=port,
            username=username,
            password=password,
            timeout=6.0,
            allow_agent=False,
            look_for_keys=False,
            banner_timeout=6.0
        )
        logger.info("  [+] Authentication SUCCESSFUL (root:password). Opening interactive PTY shell...")

        shell = client.invoke_shell(term="xterm", width=220, height=50)
        time.sleep(0.8)

        for cmd in BENIGN_COMMANDS:
            logger.info(f"  [CMD_EXEC] $ {cmd}")
            shell.send(f"{cmd}\n")
            cmds_run += 1
            time.sleep(0.9)

        shell.send("exit\n")
        time.sleep(0.5)
        logger.info(f"[+] Benign session completed ({cmds_run} commands executed) and cleanly disconnected.")
    except Exception as e:
        logger.error(f"[!] Benign session error: {e}")
    finally:
        client.close()

    return {"mode": "benign", "commands_executed": cmds_run}


def trigger_immediate_ml_scoring():
    """
    Waits briefly for Filebeat to ship the new Cowrie log lines to Elasticsearch,
    then immediately runs the Athena ML Anomaly Detection pipeline so the
    dashboard updates right away without waiting for a separate daemon timer.
    """
    try:
        logger.info("Waiting 2.0s for Filebeat log ingestion into Elasticsearch...")
        time.sleep(2.0)
        from elasticsearch import Elasticsearch
        from ml.anomaly_detector import AthenaSessionPipeline, DEFAULT_ES_HOST
        es = Elasticsearch(DEFAULT_ES_HOST)
        pipeline = AthenaSessionPipeline(es)
        count = pipeline.evaluate_and_index_sessions()
        logger.info(f"[✓] ML Scoring complete! Evaluated & updated {count} sessions in Elasticsearch.")
    except Exception as e:
        logger.warning(f"Could not auto-trigger ML scoring ({e}). Ensure Elasticsearch is running.")


def main():
    parser = argparse.ArgumentParser(description="Athena SOC Honeypot Attack Simulator")
    parser.add_argument("--host", default="localhost", help="Cowrie Honeypot Host (default: localhost)")
    parser.add_argument("--port", type=int, default=2222, help="Cowrie Honeypot Port (default: 2222)")
    parser.add_argument("--mode", choices=["brute-force", "spray", "benign", "all"], default="brute-force",
                        help="Simulation mode: brute-force, spray, benign, or all")
    parser.add_argument("--attempts", type=int, default=12, help="Number of brute-force attempts")
    parser.add_argument("--delay", type=float, default=0.08, help="Delay between attempts in seconds")

    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info(" Project Athena — Honeypot Attack Simulator")
    logger.info("=" * 60)

    if not test_ssh_connection(args.host, args.port):
        logger.error(f"Honeypot not responding on {args.host}:{args.port}. Ensure 'docker compose up -d' is running.")
        sys.exit(1)

    if args.mode in ("brute-force", "all"):
        run_brute_force_attack(args.host, args.port, target_user="root", attempts=args.attempts, delay=args.delay)

    if args.mode in ("spray", "all"):
        time.sleep(0.5)
        run_credential_spray(args.host, args.port, delay=args.delay)

    if args.mode in ("benign", "all"):
        time.sleep(0.5)
        run_benign_session(args.host, args.port)

    trigger_immediate_ml_scoring()
    logger.info("[✓] Attack simulation sequence completed — Dashboard updated!")


if __name__ == "__main__":
    main()
