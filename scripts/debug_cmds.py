import sys
import logging
logging.disable(logging.CRITICAL)
sys.path.insert(0, r"c:\Work\SY\athena\athena")
from elasticsearch import Elasticsearch
from ml.anomaly_detector import AthenaSessionPipeline

es = Elasticsearch("http://localhost:9200")
p = AthenaSessionPipeline(es)
raw = p.fetch_raw_cowrie_events()
sessions = p.aggregate_sessions(raw)

has_cmds = [(sid, d) for sid, d in sessions.items() if len(d.get("commands", [])) > 0]
print(f"Sessions with commands: {len(has_cmds)} out of {len(sessions)}")
for sid, d in has_cmds[:5]:
    cmds = d.get("commands", [])
    rate = d.get("login_attempts_per_min", 0)
    dur = d.get("session_duration", 0)
    print(f"  {sid[:8]}  {len(cmds)} commands  rate:{rate:.2f}/min  dur:{dur:.0f}s")
    for c in cmds[:3]:
        print(f"    -> {c}")

# Also show what the raw events look like for a benign session
print()
cmd_events = [e for e in raw if e.get("eventid") == "cowrie.command.input"]
print(f"Total command.input events in raw: {len(cmd_events)}")
if cmd_events:
    e = cmd_events[0]
    print(f"  session field value: '{e.get('session', 'MISSING')}'")
    print(f"  input field value:   '{e.get('input', 'MISSING')}'")
    print(f"  message field value: '{e.get('message', 'MISSING')}'")
