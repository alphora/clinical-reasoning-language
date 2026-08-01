import base64, json, os, glob
HERE = os.path.dirname(os.path.abspath(__file__))
DEF = os.path.join(HERE, "policies", "sur716-011")
FHIR, CQL = os.path.join(DEF,"fhir"), os.path.join(DEF,"cql")
def b64(t): return base64.b64encode(t.encode()).decode()
def read(p):
    with open(p, encoding="utf-8") as f: return f.read()
entries=[]
for path in sorted(glob.glob(os.path.join(FHIR,"*","*.json"))):
    res=json.loads(read(path))
    if res.get("resourceType")=="Library":
        for c in res.get("content",[]):
            if c.get("contentType")=="text/cql" and "url" in c:
                c["data"]=b64(read(os.path.join(CQL, os.path.basename(c["url"])))); del c["url"]
    entries.append({"resource":res})
entries.append({"resource":{"resourceType":"Patient","id":"sur-p","birthDate":"1980-01-01"}})
bundle={"resourceType":"Bundle","type":"collection","entry":entries}
os.makedirs(os.path.join(HERE,"work"),exist_ok=True)
out=os.path.join(HERE,"work","sur-input.json")
with open(out,"w",encoding="utf-8") as f: json.dump(bundle,f,indent=2)
print(out)
