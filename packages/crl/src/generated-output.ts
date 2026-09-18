// REFACTOR:grounded - generated directories are replaced after complete preflight.
import { lstatSync, statSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";

export interface GeneratedWrite { file: string; bytes: string }

/** Check the actual directory boundary before recursive deletion. Never follow a linked boundary. */
export function checkGeneratedDirectory(directory: string): string {
  const base = resolve(directory);
  if (base === parse(base).root) throw new Error("Refusing to replace a filesystem root");
  // The caller selected this output path. Ancestor aliases (macOS /var,
  // Windows junctioned workspaces) are valid; only the deletion boundary is refused.
  for (let current = base; ; current = dirname(current)) {
    try {
      const stat = current === base ? lstatSync(current) : statSync(current);
      if (current === base && stat.isSymbolicLink()) throw new Error(`Linked generated output boundary: ${current}`);
      if (!stat.isDirectory()) throw new Error(`Generated output boundary is not a directory: ${current}`);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (current === dirname(current)) break;
  }
  return base;
}

/** Serialize before calling, so invalid later files cannot destroy previous output. */
export function planGeneratedWrites(directory: string, entries: ReadonlyArray<{ path: string; bytes: string }>): GeneratedWrite[] {
  const base = checkGeneratedDirectory(directory);
  const seen = new Set<string>();
  return entries.map((entry) => {
    const file = resolve(base, entry.path), rel = relative(base, file);
    if (isAbsolute(entry.path) || !rel || rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) {
      throw new Error(`Path traversal blocked: ${entry.path} escapes ${base}`);
    }
    const key = process.platform === "win32" ? file.toLowerCase() : file;
    if (typeof entry.bytes !== "string") throw new Error(`Invalid output bytes: ${entry.path}`);
    if ([...seen].some((other) => key.startsWith(other + sep) || other.startsWith(key + sep))) throw new Error(`Output file/directory collision: ${entry.path}`);
    if (seen.has(key)) throw new Error(`Output filename collision: ${entry.path}`);
    seen.add(key);
    return { file, bytes: entry.bytes };
  });
}

export function clearGeneratedDirectory(directory: string): void {
  const base = checkGeneratedDirectory(directory);
  rmSync(base, { recursive: true, force: true, maxRetries: 3 });
  mkdirSync(base, { recursive: true });
}

export function writeGeneratedFiles(plan: ReadonlyArray<GeneratedWrite>, sink: string[] = []): string[] {
  for (const { file, bytes } of plan) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes, "utf8");
    sink.push(file);
  }
  return sink;
}
