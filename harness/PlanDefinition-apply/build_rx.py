#!/usr/bin/env python3
# Build a $r5.apply input bundle for rx501-147 (Risankizumab Coverage) — the #186
# empty-activities-only-library acceptance test. Exercises the CROHN'S-MET certify path:
#   Patient (birthDate -> age >= 18) + one Crohn's Observation (value true).
# The determination ActivityDefinitions now bind library[] to the Interface library
# (not the dropped empty "Medical Policy Determination" Library); this proves they
# still resolve under $apply. Output -> work/rx-input.json ; prints the Patient id.
import base64, json, os, glob, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEF_DIR = os.path.join(HERE, "policies", "rx501-147")
OUT_DIR = os.path.join(HERE, "work")
FHIR_DIR, CQL_DIR = os.path.join(DEF_DIR, "fhir"), os.path.join(DEF_DIR, "cql")
CS = "http://example.org/hcsc/rx501-147/CodeSystem/rx501-147-medical-policy-local"


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
                    c["data"] = b64(read(os.path.join(CQL_DIR, os.path.basename(c["url"]))))
                    del c["url"]
        entries.append({"resource": res})
    return entries


def build():
    entries = def_entries()
    # age >= 18 comes from Patient.birthDate via the Inferred age-recency merge (no age
    # Observation needed). One Crohn's Observation (value true) satisfies the Crohn's leaf.
    entries.append({"resource": {"resourceType": "Patient", "id": "rx-crohns",
                                 "birthDate": "1980-01-01"}})
    entries.append({"resource": {
        "resourceType": "Observation", "id": "obs-crohns", "status": "final",
        "code": {"coding": [{"system": CS, "code": "moderate-to-severely-active-crohns-disease",
                             "display": "Moderate To Severely Active Crohn's Disease"}]},
        "subject": {"reference": "Patient/rx-crohns"},
        "valueBoolean": True,
    }})
    bundle = {"resourceType": "Bundle", "type": "collection", "entry": entries}
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, "rx-input.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(bundle, f, indent=2)
    return "rx-crohns", out


if __name__ == "__main__":
    pid, out = build()
    print(pid, out)
