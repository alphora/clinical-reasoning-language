// LanguageServiceHost — the filesystem abstraction for headless language services
// (#132 step 2), so services are reusable by a non-Node editor (Coral) instead of
// hard-wiring `node:fs`. Ships a Node implementation. See discussion 088.
//
// NOTE: defined in step 2 but NOT yet wired into projectIndex. projectIndex's I/O is
// transitively coupled to node:fs via the import resolver (src/imports — findProjectRoot
// uses statSync, resolveImports/buildRegistry scan the tree), so a faithful decoupling is
// a reviewed follow-on. This module ships the contract + Node impl + characterization tests.

import * as fs from "node:fs";
import { canonicalize } from "./paths";

/** A directory entry (the subset of node:fs.Dirent the services need). */
export interface LsDirEntry {
  readonly name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface LanguageServiceHost {
  /**
   * UTF-8 file contents. Consults `overlays` first (unsaved buffers).
   * THROWS on read failure (matches node:fs.readFileSync). Callers that tolerate
   * missing files wrap this in try/catch.
   */
  readFile(filePath: string): string;
  /** Non-recursive directory listing. THROWS if the directory cannot be read. */
  readDir(dirPath: string): LsDirEntry[];
  /** Absolute workspace roots. Core must not bake VS Code's "first folder only" policy. */
  readonly workspaceRoots: readonly string[];
  /**
   * Unsaved-buffer overlays, keyed by canonicalized absolute path. The host READS this
   * map; the consumer owns mutation (single source of truth — no split-brain).
   */
  readonly overlays?: ReadonlyMap<string, string>;
}

export interface NodeLanguageServiceHostOptions {
  workspaceRoots?: readonly string[];
  /** Shared overlay map (canonicalized keys); the host reads, the consumer mutates. */
  overlays?: ReadonlyMap<string, string>;
}

export class NodeLanguageServiceHost implements LanguageServiceHost {
  readonly workspaceRoots: readonly string[];
  readonly overlays?: ReadonlyMap<string, string>;

  constructor(opts: NodeLanguageServiceHostOptions = {}) {
    this.workspaceRoots = opts.workspaceRoots ?? [];
    this.overlays = opts.overlays;
  }

  readFile(filePath: string): string {
    if (this.overlays) {
      const ov = this.overlays.get(canonicalize(filePath));
      if (ov !== undefined) return ov;
    }
    return fs.readFileSync(filePath, "utf-8");
  }

  readDir(dirPath: string): LsDirEntry[] {
    return fs.readdirSync(dirPath, { withFileTypes: true }).map((e) => ({
      name: e.name,
      isDirectory: () => e.isDirectory(),
      isFile: () => e.isFile(),
    }));
  }
}
