#!/usr/bin/env python3
# Build $r5.apply input bundles for the #215 UPPER-BOUND patient-age both-rep feature
# (`age today under 21 years`). One $apply per case. Emits case bundles a-e from the
# emitted patient-age-upper def (policies/patient-age-upper) + inline Patient/Observation.
# Output -> work/age-upper-input-<case>.json.  argv: <case> (a..e); prints the Patient id.
#
# The headline cell is (c): a member of UNKNOWN age. `sem-not "Age 21 Or Older"` would
# make this TRUE (certify through the pediatric pathway — the KE-measured bug); the
# positive `under 21` predicate rides recencyAgeTruths (null -> {} -> FALSE), so it DENIES.
import base64, json, os, glob, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEF_DIR = os.path.join(HERE, "policies", "patient-age-upper")
OUT_DIR = os.path.join(HERE, "work")
FHIR_DIR, CQL_DIR = os.path.join(DEF_DIR, "fhir"), os.path.join(DEF_DIR, "cql")
CS = "http://example.org/crl/patient-age-upper/CodeSystem/patient-age-upper-local"


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
    if lastUpdated is not None:
        p["meta"] = {"lastUpdated": lastUpdated}
    if birthDate is not None:
        p["birthDate"] = birthDate
    return p


def under21_obs(oid, pid, value, effective, status="final"):
    # Local assertion of the under-21 case-feature. Recency keys on effectiveDateTime.
    return {
        "resourceType": "Observation",
        "id": oid,
        "status": status,
        "code": {"coding": [{"system": CS, "code": "under-21", "display": "Under Twenty One"}]},
        "subject": {"reference": "Patient/" + pid},
        "valueBoolean": value,
        "effectiveDateTime": effective,
    }


# Ages are relative to the engine eval date (~2026): birthDate 2011 => age 15 (< 21);
# 2005 => age 21 (NOT < 21, exclusive boundary); 1980 => age 46 (>= 21).
CASES = {
    # in-range: age 15 -> under 21 TRUE -> Approve
    "a": {"patient": patient("age-up-a", birthDate="2011-01-01", lastUpdated="2026-01-01T00:00:00Z"), "obs": []},
    # out-of-range: age 46 -> under 21 FALSE -> Deny
    "b": {"patient": patient("age-up-b", birthDate="1980-01-01", lastUpdated="2026-01-01T00:00:00Z"), "obs": []},
    # THE FIX: unknown age (no birthDate, no local obs) -> under 21 FALSE -> Deny (sem-not would grant)
    "c": {"patient": patient("age-up-c", birthDate=None, lastUpdated=None), "obs": []},
    # exclusive boundary: age 21 -> 21 < 21 is FALSE -> Deny (a member who turned 21 is NOT under 21)
    "d": {"patient": patient("age-up-d", birthDate="2005-01-01", lastUpdated="2026-01-01T00:00:00Z"), "obs": []},
    # recency (local wins): computed age 46 (FALSE) but a NEWER local under-21=TRUE assertion -> TRUE -> Approve
    "e": {"patient": patient("age-up-e", birthDate="1980-01-01", lastUpdated="2026-01-01T00:00:00Z"),
          "obs": [under21_obs("obs-up-e", "age-up-e", True, "2026-06-01T00:00:00Z")]},
}


def build(case):
    entries = def_entries()
    c = CASES[case]
    entries.append({"resource": c["patient"]})
    for o in c["obs"]:
        entries.append({"resource": o})
    bundle = {"resourceType": "Bundle", "type": "collection", "entry": entries}
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, "age-upper-input-%s.json" % case)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(bundle, f, indent=2)
    return c["patient"]["id"], out


if __name__ == "__main__":
    case = sys.argv[1]
    pid, out = build(case)
    print(pid)
