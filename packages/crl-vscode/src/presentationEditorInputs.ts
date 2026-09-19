import * as fs from "node:fs";
import * as path from "node:path";

/** Match local registry discovery, including unsaved files that would be discovered on save. */
export function isLocalPresentationInput(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(".." + path.sep)
  )
    return false;
  const parts = relative.split(path.sep);
  if (
    parts.some(
      (p) => p.startsWith(".") || ["node_modules", "dist", "build"].includes(p),
    )
  )
    return false;
  let dir = root;
  for (const part of parts.slice(0, -1)) {
    dir = path.join(dir, part);
    if (fs.existsSync(path.join(dir, "package.json"))) return false;
    if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) return false;
  }
  return (
    file.endsWith(".crl") &&
    (!fs.existsSync(file) || !fs.lstatSync(file).isSymbolicLink())
  );
}

interface OpenDocument {
  uri: { scheme: string; fsPath: string; toString(): string };
  version: number;
  getText(): string;
}
export function capturePresentationBuffers(
  root: string,
  documents: readonly OpenDocument[],
) {
  const overlays = new Map<string, string>(),
    versions = new Map<string, number>();
  for (const document of documents) {
    if (
      document.uri.scheme !== "file" ||
      !isLocalPresentationInput(root, document.uri.fsPath)
    )
      continue;
    const file = document.uri.fsPath;
    if (!fs.existsSync(file))
      throw new Error(
        "Save newly created CRL files so project validation can discover them.",
      );
    overlays.set(fs.realpathSync(file), document.getText());
    versions.set(document.uri.toString(), document.version);
  }
  return { overlays, versions };
}
