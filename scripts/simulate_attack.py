"""
=============================================================================
Project Athena — Honeypot Traffic & Attack Simulation Engine
=============================================================================
Module: scripts.simulate_attack
Description:
    Generates realistic SSH traffic against the Cowrie honeypot (port 2222)
    to test the entire Athena detection pipeline end-to-end:
      1. Brute-Force Attack (Hydra-style): High-velocity password guessing
         against target accounts (e.g. root, admin) with minimal delay.
      2. Credential Spray Attack: Rapid testing of unique usernames with
         common default passwords.
      3. Benign / Baseline Session: Realistic human interaction with normal
         inter-command delay, legitimate terminal commands, and proper logout.

Viva / Architecture Defense Notes:
    - Simulates attacker tool signatures (e.g., Hydra, Medusa, Metasploit)
      directly against the emulated Cowrie SSH daemon.
    - Allows measuring detection latency (time from attack packet sent to
      Elasticsearch indexing and ML anomaly alert generation).
=============================================================================
"""

import sys
import os
import time
import socket
import argparse
import logging
from typing import List, Tuple

import paramiko

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [AttackSim] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("AttackSim")

# Wordlists for attack generation
COMMON_USERNAMES = [
    "root", "admin", "ubuntu", "user", "oracle", "test", "support",
    "guest", "postgres", "ftpuser", "git", "deploy", "ansible"
]

COMMON_PASSWORDS = [
    "123456", "password", "root", "admin", "12345678", "toor",
    "qwerty", "secret", "pass123", "letmein", "welcome", "cisco",
    "password123", "iloveyou", "master", "dragon", "111111"
]

BENIGN_COMMANDS = [
    "whoami",
    "uname -a",
    "uptime",
    "ls -la /var/log",
    "cat /etc/os-release",
    "df -h",
    "free -m",
    "exit"
]


def test_ssh_connection(host: str, port: int, timeout: float = 3.0) -> bool:
    """Checks if the honeypot port is reachable."""
    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            banner = sock.recv(1024)
            logger.info(f"Honeypot reachable at {host}:{port} — Banner: {banner.decode('utf-8', errors='ignore').strip()}")
            return True
    except Exception as e:
        logger.error(f"Cannot reach honeypot at {host}:{port} — Error: {e}")
        return False


def run_brute_force_attack(host: str, port: int, target_user: str = "root", attempts: int = 15, delay: float = 0.1):
    """
    Simulates high-velocity password brute-forcing (Hydra-style).
    Rapidly attempts passwords against a single user account.
    """
    logger.info(f"==> Launching BRUTE-FORCE Attack on {host}:{port} (User: '{target_user}', Attempts: {attempts}, Delay: {delay}s)...")
    successes = 0
    failures = 0

    for i in range(min(attempts, len(COMMON_PASSWORDS))):
        pwd = COMMON_PASSWORDS[i]
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            # Attempt authentication
            client.connect(
                hostname=host,
                port=port,
                username=target_user,
                password=pwd,
                timeout=2.0,
                allow_agent=False,
                look_for_keys=False,
                banner_timeout=2.0
            )
            logger.info(f"[{i+1}/{attempts}] [SUCCESS] Credentials accepted: {target_user}:{pwd}")
            successes += 1
            client.close()
        except paramiko.AuthenticationException:
            logger.info(f"[{i+1}/{attempts}] [FAILED] Rejected attempt: {target_user}:{pwd}")
            failures += 1
        except Exception as e:
            logger.warning(f"[{i+1}/{attempts}] [ERROR] Connection error: {e}")
        finally:
            client.close()

        if delay > 0:
            time.sleep(delay)

    logger.info(f"[+] Brute-force simulation finished: {failures} failed attempts, {successes} successful.")


def run_credential_spray(host: str, port: int, password: str = "password123", delay: float = 0.15):
    """
    Simulates multi-username dictionary spraying.
    Tests multiple usernames against the target host using one or two passwords.
    """
    logger.info(f"==> Launching CREDENTIAL SPRAY on {host}:{port} ({len(COMMON_USERNAMES)} usernames)...")
    for i, user in enumerate(COMMON_USERNAMES):
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            client.connect(
                hostname=host,
                port=port,
                username=user,
                password=password,
                timeout=2.0,
                allow_agent=False,
                look_for_keys=False
            )
            logger.info(f"[{i+1}/{len(COMMON_USERNAMES)}] [SUCCESS] Spray hit: {user}:{password}")
        except paramiko.AuthenticationException:
            logger.info(f"[{i+1}/{len(COMMON_USERNAMES)}] [FAILED] Tried user: '{user}'")
        except Exception as e:
            logger.warning(f"[{i+1}/{len(COMMON_USERNAMES)}] [ERROR] Connection error: {e}")
        finally:
            client.close()

        if delay > 0:
            time.sleep(delay)

    logger.info("[+] Credential spray simulation finished.")


def run_benign_session(host: str, port: int, username: str = "root", password: str = "password"):
    """
    Simulates a realistic human / sysadmin interactive SSH session.

    Fix rationale (viva-ready):
      Cowrie's default userdb negates root:root ('!root') and root:123456 ('!123456').
      The wildcard entry 'root:x:*' accepts any OTHER password.
      We use 'root:password' — confirmed accepted by Cowrie default config.

      This is critical for ML validation: without a successful auth, both
      brute-force and benign sessions produce the same failed-login-only
      feature vector, making them indistinguishable to the Isolation Forest.

    Feature vector produced by a correct benign session (vs brute-force):
      login_attempts_per_min: ~0.2-0.5  (1 attempt over a 90-120s session)
      unique_usernames: 1               (single target user)
      session_duration: ~90-120s        (long, human-paced)
      command_count: 6-7 commands       (post-auth activity — key differentiator)
    """
    logger.info(f"==> Simulating BENIGN Admin Session on {host}:{port} (User: '{username}')...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

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
        logger.info("[+] Authentication SUCCESSFUL. Opening interactive PTY shell...")

        # invoke_shell opens a PTY channel — Cowrie records each command sent
        # as a cowrie.command.input event, which feeds command_count feature.
        shell = client.invoke_shell(term="xterm", width=220, height=50)
        time.sleep(1.5)  # Wait for the shell prompt to render

        for cmd in BENIGN_COMMANDS:
            logger.info(f"    Executing: $ {cmd}")
            shell.send(f"{cmd}\n")
            # Realistic human inter-command delay (reading output before next command)
            time.sleep(4.0)

        # Drain buffer
        if shell.recv_ready():
            output = shell.recv(8192).decode("utf-8", errors="ignore")
            logger.info(f"[+] Shell output (excerpt):\n{output[:300]}")

        # Clean logout
        shell.send("exit\n")
        time.sleep(1.0)
        logger.info("[+] Benign session completed and cleanly disconnected.")

    except paramiko.AuthenticationException as e:
        logger.error(
            f"[!] AUTH FAILED for {username}:{password} — {e}\n"
            f"    Cowrie accepts: root:password, root:letmein, root:toor — NOT root:root or root:123456"
        )
    except Exception as e:
        logger.warning(f"[!] Session error: {e}")
    finally:
        client.close()
        logger.info("[+] Benign session closed.")


def main():
    parser = argparse.ArgumentParser(description="Athena SOC Honeypot Attack Simulator")
    parser.add_argument("--host", default="localhost", help="Cowrie Honeypot Host (default: localhost)")
    parser.add_argument("--port", type=int, default=2222, help="Cowrie Honeypot Port (default: 2222)")
    parser.add_argument("--mode", choices=["brute-force", "spray", "benign", "all"], default="brute-force",
                        help="Simulation mode: brute-force, spray, benign, or all")
    parser.add_argument("--attempts", type=int, default=15, help="Number of brute-force attempts")
    parser.add_argument("--delay", type=float, default=0.1, help="Delay between attempts in seconds")

    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info(" Project Athena — Honeypot Attack Simulator")
    logger.info("=" * 60)

    if not test_ssh_connection(args.host, args.port):
        logger.error(f"Honeypot not responding on {args.host}:{args.port}. Ensure docker compose is up.")
        sys.exit(1)

    if args.mode in ("brute-force", "all"):
        run_brute_force_attack(args.host, args.port, target_user="root", attempts=args.attempts, delay=args.delay)

    if args.mode in ("spray", "all"):
        time.sleep(1.0)
        run_credential_spray(args.host, args.port, delay=args.delay)

    if args.mode in ("benign", "all"):
        time.sleep(1.0)
        run_benign_session(args.host, args.port)

    logger.info("[✓] Attack simulation sequence completed.")


if __name__ == "__main__":
    main()
