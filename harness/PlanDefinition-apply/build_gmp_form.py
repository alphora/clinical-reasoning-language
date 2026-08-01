import base64, json, os, glob, sys
HERE=os.path.dirname(os.path.abspath(__file__)); DEF=os.path.join(HERE,"policies","generic-medical-policy")
FHIR,CQL=os.path.join(DEF,"fhir"),os.path.join(DEF,"cql")
CS="http://example.org/hcsc/generic-medical-policy/CodeSystem/generic-medical-policy-local"
rt=sys.argv[1] if len(sys.argv)>1 else "request-type-drug"
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
entries.append({"resource":{"resourceType":"Observation","id":"o-rt","status":"final","code":{"coding":[{"system":CS,"code":rt}]},"subject":{"reference":"Patient/gmp-p"},"valueBoolean":True}})
b={"resourceType":"Bundle","type":"collection","entry":entries}
os.makedirs(os.path.join(HERE,"work"),exist_ok=True)
out=os.path.join(HERE,"work","gmp-form.json"); json.dump(b,open(out,"w",encoding="utf-8"),indent=2); print(out)
