#!/usr/bin/env python3
# Build a twostep (nested Q1->Q2) "server" bundle (def + Patient [+ optional Q1/Q2
# baseline answer Observations]) from the emitted policy under policies/twostep/.
#   argv: <defDir> <out.json> [Q1] [Q2]   (Q1/Q2 = none|true|false)
# defDir defaults to policies/twostep next to this script.
import base64, json, os, glob, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEF_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "policies", "twostep")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "work", "twostep-input.json")
Q1 = sys.argv[3] if len(sys.argv) > 3 else "none"
Q2 = sys.argv[4] if len(sys.argv) > 4 else "none"
FHIR_DIR, CQL_DIR = os.path.join(DEF_DIR, "fhir"), os.path.join(DEF_DIR, "cql")
CSQ1 = "http://example.org/crl/twostep/CodeSystem/twostep-local"


def b64(t):
    return base64.b64encode(t.encode()).decode()


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def def_entries():
    E = []
    for p in sorted(glob.glob(os.path.join(FHIR_DIR, "*", "*.json"))):
        r = json.loads(read(p))
        if r.get("resourceType") == "Library":
            for c in r.get("content", []):
                if c.get("contentType") == "text/cql" and "url" in c:
                    c["data"] = b64(read(os.path.join(CQL_DIR, os.path.basename(c["url"]))))
                    del c["url"]
        E.append({"resource": r})
    return E


def obs(oid, code, val):
    return {"resourceType": "Observation", "id": oid, "status": "final",
            "code": {"coding": [{"system": CSQ1, "code": code}]},
            "subject": {"reference": "Patient/ts-pt"}, "valueBoolean": val,
            "effectiveDateTime": "2026-06-01T00:00:00Z"}


E = def_entries()
E.append({"resource": {"resourceType": "Patient", "id": "ts-pt", "meta": {"lastUpdated": "2026-01-01T00:00:00Z"}}})
if Q1 in ("true", "false"):
    E.append({"resource": obs("obs-q1", "q1", Q1 == "true")})
if Q2 in ("true", "false"):
    E.append({"resource": obs("obs-q2", "q2", Q2 == "true")})
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"resourceType": "Bundle", "type": "collection", "entry": E}, open(OUT, "w"), indent=2)
print("ts-pt")
