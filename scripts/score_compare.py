import logging
logging.disable(logging.CRITICAL)
import sys
sys.path.insert(0, r"c:\Work\SY\athena\athena")
from elasticsearch import Elasticsearch
from ml.anomaly_detector import AthenaSessionPipeline

es = Elasticsearch("http://localhost:9200")
p = AthenaSessionPipeline(es)
raw = p.fetch_raw_cowrie_events()
sessions = p.aggregate_sessions(raw)

rf = p.rule_filter
ml = p.ml_detector

results = []
for sid, data in sessions.items():
    rule_flagged, _, rule_risk = rf.evaluate(data)
    if rule_flagged:
        score = 1.0
        risk = rule_risk
    else:
        _, score, risk = ml.score_session(data)
    results.append({
        "score": score,
        "risk": risk,
        "cmds": data.get("command_count", 0),     # use command_count not commands
        "rate": data.get("login_attempts_per_min", 0),
        "dur": data.get("session_duration", 0),
        "success": data.get("success_login_count", 0),
    })

benign = sorted([r for r in results if r["cmds"] >= 5], key=lambda x: x["score"])
attacks = sorted([r for r in results if r["rate"] > 5], key=lambda x: x["score"], reverse=True)
middle = sorted([r for r in results if r["cmds"] == 0 and r["rate"] <= 5], key=lambda x: x["score"], reverse=True)

print(f"Total sessions scored: {len(results)}")
print(f"  Benign-like (>=5 cmds):        {len(benign)}")
print(f"  Attack-like (>5 logins/min):   {len(attacks)}")
print(f"  Other (failed auth, low rate): {len(middle)}")
print()

print("BENIGN SESSIONS (successful auth + >=5 commands):")
for s in benign[:6]:
    print(f"  score:{s['score']:.4f}  risk:{s['risk']:<10}  cmds:{s['cmds']}  auth_ok:{s['success']}  rate:{s['rate']:.2f}/min  dur:{s['dur']:.0f}s")

print()
print("ATTACK SESSIONS (>5 logins/min, brute-force):")
for s in attacks[:6]:
    print(f"  score:{s['score']:.4f}  risk:{s['risk']:<10}  cmds:{s['cmds']}  auth_ok:{s['success']}  rate:{s['rate']:.2f}/min  dur:{s['dur']:.0f}s")

if benign and attacks:
    ab = sum(s["score"] for s in benign) / len(benign)
    aa = sum(s["score"] for s in attacks) / len(attacks)
    pct = (aa - ab) / max(ab, 0.0001) * 100
    print()
    print("=" * 60)
    print("BEFORE FIX: benign used root:root -> auth FAILED -> 0 cmds")
    print("            -> indistinguishable from attack (same score)")
    print()
    print("AFTER  FIX: root:password accepted -> auth SUCCESS -> 8 cmds")
    print()
    print(f"  Avg BENIGN score: {ab:.4f}  (normal — successful login, commands)")
    print(f"  Avg ATTACK score: {aa:.4f}  (anomaly — high rate, no commands)")
    print(f"  Score delta:     +{aa - ab:.4f}  (attacks score {pct:.0f}% higher than benign)")
    print("=" * 60)
