import base64, json, glob, sys, os
DEF="policies/dme101-030"; FHIR=DEF+"/fhir"; CQL=DEF+"/cql"; CASES=DEF+"/cases"
def b64(t): return base64.b64encode(t.encode()).decode()
def read(p):
    with open(p, encoding="utf-8") as f: return f.read()
def build(case):
    entries=[]
    for p in sorted(glob.glob(FHIR+"/*/*.json")):
        res=json.loads(read(p))
        if res.get("resourceType")=="Library":
            for c in res.get("content",[]):
                if c.get("contentType")=="text/cql" and "url" in c:
                    c["data"]=b64(read(CQL+"/"+os.path.basename(c["url"]))); del c["url"]
        entries.append({"resource":res})
    pid=None; ncase=0
    for p in sorted(glob.glob(CASES+"/**/"+case+"/*/*.json", recursive=True)):
        res=json.loads(read(p)); ncase+=1
        if res.get("resourceType")=="Patient": pid=res["id"]
        entries.append({"resource":res})
    os.makedirs("work",exist_ok=True)
    json.dump({"resourceType":"Bundle","type":"collection","entry":entries}, open("work/dme-case.json","w"), indent=2)
    sys.stderr.write(f"case resources: {ncase}, defs+case entries: {len(entries)}\n")
    print(pid or "MISSING")
build(sys.argv[1])
