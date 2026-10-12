"""Create or verify the installed-file identity for the candidate pipeline package."""
import argparse
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE / "pipeline-candidate"
MANIFEST = HERE / "pipeline-package-manifest.json"
ALLOWED = (".claude", ".vibe-tools")


def files():
    result = {}
    for folder in ALLOWED:
        base = ROOT / folder
        if not base.is_dir():
            raise ValueError("missing package folder: " + folder)
        for path in sorted(base.rglob("*")):
            if path.is_symlink():
                raise ValueError("symlink in package: " + str(path))
            if not path.is_file():
                continue
            rel = path.relative_to(ROOT).as_posix()
            if "__pycache__" in path.parts or path.suffix == ".pyc":
                raise ValueError("generated cache in package: " + rel)
            result[rel] = hashlib.sha256(path.read_bytes()).hexdigest()
    if not result:
        raise ValueError("empty package")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("write", "verify"))
    args = parser.parse_args()
    inventory = files()
    if args.action == "write":
        payload = {
            "schema": "ke-pipeline-package/1",
            "installationRoot": "prepared <artifact branch>-nautilus checkout root",
            "upstreamSeed": "iehp-ke-batch-clean@4c8fb7e62a78e4d254b89b3053619a759c45e8b1",
            "status": "candidate-needs-approved-smile-binding-and-codespace-qualification",
            "files": inventory,
        }
        MANIFEST.write_bytes((json.dumps(payload, indent=2) + "\n").encode("utf-8"))
    else:
        payload = json.loads(MANIFEST.read_text(encoding="utf-8"))
        if payload.get("schema") != "ke-pipeline-package/1" or payload.get("files") != inventory:
            raise ValueError("manifest differs from package bytes/inventory")
    print(json.dumps({"status": args.action + "-pass", "files": len(inventory),
                      "manifestSha256": hashlib.sha256(MANIFEST.read_bytes()).hexdigest()}))


if __name__ == "__main__":
    main()
