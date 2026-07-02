#!/usr/bin/env python3
# Assemble the patient-age DEFINITION bundle (Libraries with inlined base64 CQL +
# SD/CodeSystem/PlanDefinitions) from the emitted policy under policies/patient-age/.
# Imported by build_flow.py; also runnable directly:  argv: <out.json>
import base64, json, os, glob, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEF_DIR = os.path.join(HERE, "policies", "patient-age")
FHIR_DIR, CQL_DIR = os.path.join(DEF_DIR, "fhir"), os.path.join(DEF_DIR, "cql")


def b64(t):
    return base64.b64encode(t.encode("utf-8")).decode("ascii")


def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def def_entries():
    entries = []
    for path in sorted(glob.glob(os.path.join(FHIR_DIR, "*", "*.json"))):
        res = json.loads(read(path))
        if res.get("resourceType") == "Library":
            for c in res.get("content", []):
                if c.get("contentType") == "text/cql" and "url" in c:
                    cql_text = read(os.path.join(CQL_DIR, os.path.basename(c["url"])))
                    c["data"] = b64(cql_text)
                    del c["url"]
        entries.append({"resource": res})
    return entries


if __name__ == "__main__":
    out = sys.argv[1]
    bundle = {"resourceType": "Bundle", "type": "collection", "entry": def_entries()}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(bundle, f, indent=2)
    print("wrote", out, "with", len(bundle["entry"]), "entries")
