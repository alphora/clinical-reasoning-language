#!/usr/bin/env python3
# Build $r5.apply input bundles for the patient-age recency both-rep feature (single
# $apply, one case at a time). Emits case bundles a-f from the emitted patient-age def
# (policies/patient-age) + inline Patient/Observation. Output -> work/age-input-<case>.json.
#   argv: <case>   (case in a..f); prints the case Patient id.
import base64, json, os, glob, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEF_DIR = os.path.join(HERE, "policies", "patient-age")
OUT_DIR = os.path.join(HERE, "work")
FHIR_DIR, CQL_DIR = os.path.join(DEF_DIR, "fhir"), os.path.join(DEF_DIR, "cql")
CS = "http://example.org/crl/patient-age/CodeSystem/patient-age-local"


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


def patient(pid, birthDate=None, lastUpdated=None):
    p = {"resourceType": "Patient", "id": pid}
    meta = {}
    if lastUpdated is not None:
        meta["lastUpdated"] = lastUpdated
    if meta:
        p["meta"] = meta
    if birthDate is not None:
        p["birthDate"] = birthDate
    return p


def age_obs(oid, pid, value, effective, status="final"):
    # Recency keys on Observation.effective (effectiveDateTime), NOT issued. `status`
    # is parameterizable so a NON-final status proves the status filter was removed.
    return {
        "resourceType": "Observation",
        "id": oid,
        "status": status,
        "code": {"coding": [{"system": CS, "code": "age-18-or-older", "display": "Age 18 Or Older"}]},
        "subject": {"reference": "Patient/" + pid},
        "valueBoolean": value,
        "effectiveDateTime": effective,
    }


# birthDate 2000 => age >=18 today; 2015 => <18. lastUpdated/effective exercise recency.
CASES = {
    "a": {"patient": patient("age-a", birthDate="2000-01-01", lastUpdated="2026-01-01T00:00:00Z"), "obs": []},
    "b": {"patient": patient("age-b", birthDate="2015-01-01", lastUpdated="2026-01-01T00:00:00Z"), "obs": []},
    "c": {"patient": patient("age-c", birthDate="2000-01-01", lastUpdated="2026-01-01T00:00:00Z"),
          "obs": [age_obs("obs-c", "age-c", False, "2026-06-01T00:00:00Z", status="preliminary")]},
    "d": {"patient": patient("age-d", birthDate="2000-01-01", lastUpdated="2026-01-01T00:00:00Z"),
          "obs": [age_obs("obs-d", "age-d", False, "2025-01-01T00:00:00Z")]},
    "e": {"patient": patient("age-e", birthDate=None, lastUpdated=None), "obs": []},
    "f": {"patient": patient("age-f", birthDate="1980-01-01", lastUpdated=None),
          "obs": [age_obs("obs-f", "age-f", False, "2026-06-01T00:00:00Z")]},
}


def build(case):
    entries = def_entries()
    c = CASES[case]
    entries.append({"resource": c["patient"]})
    for o in c["obs"]:
        entries.append({"resource": o})
    bundle = {"resourceType": "Bundle", "type": "collection", "entry": entries}
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, "age-input-%s.json" % case)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(bundle, f, indent=2)
    return c["patient"]["id"], out


if __name__ == "__main__":
    case = sys.argv[1]
    pid, out = build(case)
    print(pid)
