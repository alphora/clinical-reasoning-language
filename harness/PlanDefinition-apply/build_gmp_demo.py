import base64, json, os, glob, sys
HERE=os.path.dirname(os.path.abspath(__file__)); DEF=os.path.join(HERE,"policies","generic-medical-policy")
FHIR,CQL=os.path.join(DEF,"fhir"),os.path.join(DEF,"cql")
CS="http://example.org/hcsc/generic-medical-policy/CodeSystem/generic-medical-policy-local"
scenario=sys.argv[1] if len(sys.argv)>1 else "ms-full"
def b64(t): return base64.b64encode(t.encode()).decode()
def read(p):
    with open(p,encoding="utf-8") as f: return f.read()
entries=[]
for path in sorted(glob.glob(os.path.join(FHIR,"*","*.json"))):
    res=json.loads(read(path))
    if res.get("resourceType")=="Library":
        for c in res.get("content",[]):
            if c.get("contentType")=="text/cql" and "url" in c:
                c["data"]=b64(read(os.path.join(CQL,os.path.basename(c["url"])))); del c["url"]
    entries.append({"resource":res})
entries.append({"resource":{"resourceType":"Patient","id":"gmp-p","birthDate":"1980-01-01"}})

n=[0]
def obs(code, value):
    n[0]+=1
    o={"resourceType":"Observation","id":"o%d"%n[0],"status":"final",
       "code":{"coding":[{"system":CS,"code":code}]},"subject":{"reference":"Patient/gmp-p"}}
    o.update(value)  # e.g. {"valueBoolean":True} / {"valueString":".."} / {"valueDateTime":".."} / {"valueCodeableConcept":{..}}
    entries.append({"resource":o})
def coded(code): return {"valueCodeableConcept":{"coding":[{"system":CS,"code":code}]}}

if scenario=="ms-full":
    obs("request-type-medical-surgical",{"valueBoolean":True})
    obs("ms-initial-treatment",{"valueBoolean":True})
    obs("ms-treatment-already-begun",{"valueBoolean":False})
    obs("ms-first-day-of-treatment",{"valueDateTime":"2026-02-01"})
    obs("ms-emergency-services-requested",{"valueBoolean":False})
    obs("ms-primary-diagnosis",{"valueString":"Osteoarthritis of the knee (M17.11)"})
    obs("ms-clinical-documents-available",{"valueBoolean":True})
    obs("ms-additional-clinical-information",{"valueString":"Failed 6 months conservative therapy; imaging attached."})
elif scenario=="drug-full":
    obs("request-type-drug",{"valueBoolean":True})
    obs("drug-type",coded("drug-type-pharmacy"))
    obs("drug-treatment-already-begun",{"valueBoolean":True})
    obs("drug-reauthorization-response-demonstrated",{"valueBoolean":True})
    obs("drug-first-day-of-treatment",{"valueDateTime":"2026-01-15"})
    obs("drug-primary-diagnosis",{"valueString":"Rheumatoid arthritis (M06.9)"})
    obs("drug-dose-frequency-route-duration",{"valueString":"40 mg subcutaneous every 14 days"})
    obs("drug-step-therapy",coded("drug-step-therapy-yes"))
    obs("drug-clinical-documents-available",{"valueBoolean":True})
    obs("drug-additional-clinical-information",{"valueString":"Documented response to therapy."})
elif scenario=="bh-full":
    obs("request-type-behavioral-mental-health",{"valueBoolean":True})
    obs("bh-treatment-already-begun",{"valueBoolean":False})
    obs("bh-first-day-of-treatment",{"valueDateTime":"2026-02-10"})
    obs("bh-emergency-services-requested",{"valueBoolean":False})
    obs("bh-risk-to-self-or-others",{"valueBoolean":True})
    obs("requested-level-of-care",coded("requested-level-of-care-inpatient"))
    obs("bh-substance-use-related",{"valueBoolean":False})
    obs("bh-primary-diagnosis",{"valueString":"Major depressive disorder, recurrent, severe (F33.2)"})
    obs("bh-clinical-documents-available",{"valueBoolean":True})
    obs("bh-additional-clinical-information",{"valueString":"Active SI; needs inpatient stabilization."})
elif scenario=="empty":
    pass  # nothing asserted -> top otherwise; $apply offers the request-type question
b={"resourceType":"Bundle","type":"collection","entry":entries}
os.makedirs(os.path.join(HERE,"work"),exist_ok=True)
out=os.path.join(HERE,"work","gmp-demo-%s.json"%scenario)
json.dump(b,open(out,"w",encoding="utf-8"),indent=2); print(out)
