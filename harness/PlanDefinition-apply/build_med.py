import base64, json, os, glob
HERE=os.path.dirname(os.path.abspath(__file__)); DEF=os.path.join(HERE,"policies","med201-014")
FHIR,CQL=os.path.join(DEF,"fhir"),os.path.join(DEF,"cql")
CS="http://example.org/hcsc/med201-014/CodeSystem/med201-014-medical-policy-local"
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
def obs(oid,code):
    return {"resource":{"resourceType":"Observation","id":oid,"status":"final",
        "code":{"coding":[{"system":CS,"code":code}]},"subject":{"reference":"Patient/med-p"},"valueBoolean":True}}
entries.append({"resource":{"resourceType":"Patient","id":"med-p","birthDate":"1980-01-01"}})
entries.append(obs("o-pf","primary-focal-hyperhidrosis"))
entries.append(obs("o-ax","axillary-hyperhidrosis-region"))
b={"resourceType":"Bundle","type":"collection","entry":entries}
os.makedirs(os.path.join(HERE,"work"),exist_ok=True)
out=os.path.join(HERE,"work","med-input.json")
json.dump(b,open(out,"w",encoding="utf-8"),indent=2); print(out)
