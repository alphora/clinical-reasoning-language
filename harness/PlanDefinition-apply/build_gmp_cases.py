import base64, json, os, glob, sys
HERE=os.path.dirname(os.path.abspath(__file__)); DEF=os.path.join(HERE,"policies","generic-medical-policy")
FHIR,CQL=os.path.join(DEF,"fhir"),os.path.join(DEF,"cql")
TESTS=os.path.join("E:/src/crl-content/artifacts/generic-medical-policy","tests","data","fhir","patient","generic-medical-policy-intake-cases")
def b64(t): return base64.b64encode(t.encode()).decode()
def read(p):
    with open(p,encoding="utf-8") as f: return f.read()
# the emitted definitions (Libraries with CQL inlined) — shared across every case bundle
defents=[]
for path in sorted(glob.glob(os.path.join(FHIR,"*","*.json"))):
    res=json.loads(read(path))
    if res.get("resourceType")=="Library":
        for c in res.get("content",[]):
            if c.get("contentType")=="text/cql" and "url" in c:
                c["data"]=b64(read(os.path.join(CQL,os.path.basename(c["url"])))); del c["url"]
    defents.append({"resource":res})

os.makedirs(os.path.join(HERE,"work","cases"),exist_ok=True)
rows=[]
for case in sorted(os.listdir(TESTS)):
    cdir=os.path.join(TESTS,case)
    if not os.path.isdir(cdir): continue
    ents=list(defents)
    pat=None
    for rp in glob.glob(os.path.join(cdir,"*","*.json")):
        r=json.loads(read(rp)); ents.append({"resource":r})
        if r.get("resourceType")=="Patient": pat=r["id"]
    b={"resourceType":"Bundle","type":"collection","entry":ents}
    out=os.path.join(HERE,"work","cases","%s.json"%case)
    json.dump(b,open(out,"w",encoding="utf-8"),indent=2)
    rows.append("%s\t%s"%(case,pat))
print("\n".join(rows))
