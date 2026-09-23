import logging
logging.disable(logging.CRITICAL)
import sys
sys.path.insert(0, r"c:\Work\SY\athena\athena")
from elasticsearch import Elasticsearch
from ml.anomaly_detector import AthenaSessionPipeline

es = Elasticsearch("http://localhost:9200")
p = AthenaSessionPipeline(es)
raw = p.fetch_raw_cowrie_events()

# Manual mini-aggregation to test the fix
sessions_manual = {}
for event in raw:
    sid = event.get("session")
    if not sid:
        continue
    if sid not in sessions_manual:
        sessions_manual[sid] = {"commands": []}
    eventid = event.get("eventid", "")
    if eventid == "cowrie.command.input":
        raw_input = event.get("input", "")
        if isinstance(raw_input, str) and raw_input:
            cmd = raw_input
        else:
            msg = event.get("message", "")
            if isinstance(msg, str) and msg.startswith("CMD: "):
                cmd = msg[5:].strip()
            else:
                cmd = msg
        if cmd:
            sessions_manual[sid]["commands"].append(cmd)

has_cmds = {k: v for k, v in sessions_manual.items() if v["commands"]}
print(f"Sessions with commands (MANUAL): {len(has_cmds)}")
for sid, d in list(has_cmds.items())[:3]:
    cmds = d["commands"]
    print(f"  {sid}  count:{len(cmds)}  first:{cmds[0] if cmds else '?'}")

# Now test the actual method
print()
sessions2 = p.aggregate_sessions(raw)
has_cmds2 = {k: v for k, v in sessions2.items() if v.get("commands")}
print(f"Sessions with commands (aggregate_sessions): {len(has_cmds2)}")
for sid, d in list(has_cmds2.items())[:3]:
    cmds = d.get("commands", [])
    print(f"  {sid}  count:{len(cmds)}")
