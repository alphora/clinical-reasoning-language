#!/usr/bin/env python3
# Build a patient-age "server" bundle (def + Patient) for the apply client.
#   argv: <out.json> <mode>
# mode = "nothing"         -> Patient with NO birthDate (age unresolved from data)
#        "birthdate-adult"  -> Patient birthDate 1980 (>=18)
#        "birthdate-child"  -> Patient birthDate 2015 (<18)
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_defbundle import def_entries

out, mode = sys.argv[1], sys.argv[2]
pid = "flow-pt"
patient = {"resourceType": "Patient", "id": pid, "meta": {"lastUpdated": "2026-01-01T00:00:00Z"}}
if mode == "birthdate-adult":
    patient["birthDate"] = "1980-01-01"
elif mode == "birthdate-child":
    patient["birthDate"] = "2015-01-01"
# "nothing" -> no birthDate

entries = def_entries()
entries.append({"resource": patient})
bundle = {"resourceType": "Bundle", "type": "collection", "entry": entries}
with open(out, "w", encoding="utf-8") as f:
    json.dump(bundle, f, indent=2)
print(pid)
