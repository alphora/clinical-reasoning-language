"""Bind installed, hash-matched CRL tools without changing accepted identities."""

import argparse
import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def bind(server, driver, engine, node, java_home, mcp_sdk):
    accepted = json.loads((HERE / "pins.json").read_text(encoding="utf-8"))
    paths = {"server": server, "driver": driver, "engine": engine}
    bound = json.loads(json.dumps(accepted))
    for name, candidate in paths.items():
        resolved = Path(candidate).resolve(strict=True)
        if not resolved.is_file():
            raise ValueError(f"{name} must be a file: {resolved}")
        actual = sha256(resolved)
        if actual != accepted[name]["sha256"]:
            raise ValueError(f"{name} hash mismatch: {actual}")
        bound[name]["path"] = resolved.as_posix()
    node_path = Path(node).resolve(strict=True)
    java_path = Path(java_home).resolve(strict=True)
    sdk_path = Path(mcp_sdk).resolve(strict=True)
    if not node_path.is_file():
        raise ValueError("node must be an executable file")
    if not (java_path / "bin/java").is_file() and not (java_path / "bin/java.exe").is_file():
        raise ValueError("java-home lacks bin/java")
    if not (sdk_path / "index.js").is_file() or not (sdk_path / "stdio.js").is_file():
        raise ValueError("mcp-sdk lacks index.js or stdio.js")
    bound["node"] = node_path.as_posix()
    bound["javaHome"] = java_path.as_posix()
    bound["mcpSdk"] = sdk_path.as_uri() + "/"
    out = PROJECT / "tmp/runtime/pins.local.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bound, indent=2) + "\n", encoding="utf-8")
    return {"status": "bound", "path": out.as_posix(), "crl": bound["crlVersion"], "kitHash": bound["kitHash"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("server", "driver", "engine", "node", "java-home", "mcp-sdk"):
        parser.add_argument("--" + key, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(bind(args.server, args.driver, args.engine, args.node, args.java_home, args.mcp_sdk)))
    except (OSError, ValueError, KeyError) as exc:
        parser.exit(2, f"runtime binding failed: {exc}\n")


if __name__ == "__main__":
    main()
