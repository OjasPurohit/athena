# Athena — Project Brief
*Read this file first. It captures every decision already made so any AI agent (Claude, Antigravity/Gemini, Odysseus, whatever) or teammate can pick this up with zero re-explaining.*

---

## 1. What Athena Is

A **self-hosted Security Operations Center (SOC) platform** with ML-based anomaly detection, built for a 2nd-year B.Tech IT major project.

**One-line pitch:** A Cowrie honeypot catches real SSH/Telnet attack attempts, ships the logs into Elasticsearch/Kibana for visualization, and an unsupervised Isolation Forest model automatically flags anomalous sessions — all running on a single homelab machine, no cloud cost, no enterprise licensing.

## 2. Team

VIT, IT Dept, SY-D, Academic Year 2026-27, Semester III

| Name | Roll No. | GR No. |
|---|---|---|
| Ojas Purohit | 44 | 1251130379 |
| Shayan Khalid | 20 | 1251130241 |
| Anup Nikhar | 40 | 1251130261 |
| Pranay Nikure | 41 | 1251130040 |

## 3. Scope — Read This Before Suggesting Architecture Changes

We deliberately scoped this to a **"medium" version**, sitting between a bare-minimum rule-based project and a full enterprise-grade SOC. This was a conscious tradeoff, already decided — **do not silently re-add or re-remove pieces without flagging it to the team first.**

**In scope:**
- Cowrie honeypot (SSH/Telnet emulation)
- Filebeat (lightweight log shipper — chosen over full Logstash to cut complexity)
- Elasticsearch (log storage/indexing)
- Kibana (dashboard/visualization)
- Isolation Forest (real, trained unsupervised ML — not just threshold rules)
- Everything runs locally via Docker Compose on a homelab machine (no cloud)

**Explicitly cut, and why:**
- ❌ **Wazuh** — redundant with Filebeat→Elasticsearch for this scale; extra tool to debug for no real gain
- ❌ **Full Logstash pipeline** — Filebeat can ship Cowrie's JSON logs directly; Logstash adds complexity without added value here
- ❌ **Grafana** — Kibana already covers dashboarding; running both is duplicate work
- ❌ **Cloud deployment (GCP/Azure)** — homelab-only keeps cost at zero and removes IAM/networking overhead; cloud deployment is "future work" in the report, not a build requirement
- ❌ **Rule-based-only detection** — rejected in favor of real ML (Isolation Forest), because a trained model is more defensible in viva and is the actual differentiator of this project

If an agent or teammate suggests re-adding any of the cut items, that's fine to discuss — but it changes scope and should be a team decision, not a silent addition.

## 4. Architecture

```
Cowrie Honeypot (SSH/Telnet, Docker)
        ↓
Filebeat (log shipper, Docker)
        ↓
Elasticsearch (storage/indexing, Docker)
        ↓
Python anomaly-detection service (Isolation Forest scoring, runs periodically)
        ↓
Kibana Dashboard (visualization + alerts)
```

## 5. Tech Stack

- **Software:** Docker & Docker Compose, Cowrie, Filebeat, Elasticsearch, Kibana, Python 3 (scikit-learn, pandas, elasticsearch-py), Git/GitHub
- **Hardware:** Any machine running Docker — min. 8GB RAM, 4-core CPU recommended. No dedicated homelab box required to start; a laptop/desktop with Docker Desktop is sufficient. (Team lead already runs a homelab with Docker experience — Jellyfin media server on a NixOS box — so migrating here later is an option, not a blocker.)
- **ML Algorithm:** Isolation Forest, trained on baseline (non-attack) session features: login attempts/minute, unique usernames tried, session duration, command count. A lightweight rule-based pre-filter (failed-login-rate threshold) runs before ML scoring to cut noise.

## 6. 5-Week Timeline

| Week | Goal | Milestone |
|---|---|---|
| **1** | Docker set up, repo created, Cowrie honeypot running and logging | Cowrie logs a real SSH login attempt to file |
| **2** | Filebeat → Elasticsearch → Kibana pipeline working | Kibana shows live honeypot activity |
| **3** | Collect baseline traffic, train Isolation Forest, build scoring script | Model correctly flags a simulated brute-force as anomalous |
| **4** | Wire anomaly scores into Kibana, stress-test with Hydra attacks | Full pipeline: attack in → alert out, on dashboard, with measured latency |
| **5** | Rehearse live demo, write docs, viva prep | Polished, submittable project; every team member can explain every component |

## 7. Project Synopsis Status

The full FF180 Project Registration form is done, including:
- Introduction (Background/Timeline, Motivation, Keywords)
- **Literature Survey: 25 entries**, all real papers pulled from search (not fabricated) — covers SSH brute-force ML classification, deep-learning log anomaly detection, honeypot deception techniques, Isolation Forest/Extended Isolation Forest variants, K-Means clustering IDS, and Cowrie+ELK integration case studies
- Gaps identified, objectives framed from gaps, problem statement
- Proposed methodology, expected outcomes, IEEE-format references

**Known caveat:** entries #23 and #25 in the literature survey have partially-confirmed author lists, and #24 is attributed by research-group pattern rather than a fully confirmed title match. Worth a quick verification pass before final submission — don't treat these three as 100% locked.

## 8. Instructions for AI Agents Picking This Up

If you're an agent (Claude Code, Antigravity, Odysseus, etc.) being pointed at this repo:

1. **Don't re-litigate Section 3.** The scope is decided. If you think something should change, say so explicitly to the user — don't just build it differently.
2. **Execute, don't decide silently.** For anything not already specified here (exact Docker Compose syntax, specific Python implementation details, dashboard styling) — use your judgment and build it. For anything that changes architecture, algorithm choice, or scope — flag it and wait for confirmation.
3. **The team needs to be able to explain every part of this in a viva.** Prefer readable, well-commented code and clear docs over clever-but-opaque solutions. If you write something non-obvious, comment *why*.
4. **Check off milestones as you complete them** by editing Section 6 of this file (mark milestones done, note actual completion dates, note any deviations from plan).
5. **Update Section 7** as the report/documentation evolves.

## 9. How to Proceed (for Ojas / the team)

1. Drop this file at the root of the `athena` GitHub repo as `PROJECT_BRIEF.md`.
2. Install Docker Desktop if not already done; confirm with `docker run hello-world`.
3. Open the repo in Antigravity (or Claude Code). Pick Claude Sonnet as the underlying model if you want reasoning consistent with this brief.
4. Give it a Week 1 task: *"Read PROJECT_BRIEF.md, then set up a Cowrie honeypot in Docker per Section 4/5. Confirm it logs SSH login attempts to a file."*
5. Review the agent's proposed plan (Antigravity shows this as an Artifact) before approving — 5 minutes of reading now saves you from not being able to explain a decision in viva later.
6. Repeat per week, checking off Section 6 as you go.
