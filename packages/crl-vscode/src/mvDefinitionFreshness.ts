// REFACTOR:grounded (Medical Review): generated drift is checked independently of native result freshness.
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { emitCrlTwoLane, definitionClosureDigest, findProjectRoot, resolveImports, writeTwoLane } from '@smile-digital-health/crl';
import { authoredCrlFiles, assertSingleLocalPolicy, generatedDefinitionDrift, mvPublicationOptions } from './mvDirectEdit';
import { assertOrdinaryEditPath, readEditTree, editTreeIdentity } from './mvEditTransaction';

export type DefinitionFreshness = { state: 'current'; digest: string } |
  { state: 'checking' | 'unknown' | 'drift'; message: string; digest?: string };

export class MvDefinitionFreshness {
  private cached?: { key: string; value: DefinitionFreshness };
  private inputs:string[]=[];
  get inputFiles():readonly string[]{return this.inputs;}
  get watchRoots():readonly string[]{return [...new Set(this.inputs.map(f=>findProjectRoot(f)).filter((r):r is string=>!!r))].sort();}
  invalidate(): void { this.cached = undefined; }
  check(policyPath: string, scratchRoot: string): DefinitionFreshness {
    try {
      const root = findProjectRoot(policyPath);
      if (!root) throw new Error('Policy package owner is unavailable.');
      const graph = resolveImports(policyPath);
      const files = new Set([join(root, 'package.json'), policyPath, ...authoredCrlFiles(root)]);
      for (const entry of [...graph.resolvedLibraries, ...graph.localLibraries, ...graph.registry?.byNamePackage.values() ?? []]) {
        files.add(entry.filePath);
        const owner = findProjectRoot(entry.filePath); if (owner) files.add(join(owner, 'package.json'));
      }
      const hash = createHash('sha256');
      this.inputs=[...files].sort();
      hash.update(JSON.stringify(graph.diagnostics));
      for (const file of [...files].sort()) { hash.update(file); hash.update(readFileSync(file)); }
      for (const lane of ['cql', 'fhir']) hash.update(JSON.stringify(editTreeIdentity(readEditTree(join(root, 'src', lane)))));
      const key = hash.digest('hex');
      if (this.cached?.key === key) return this.cached.value;
      const publication = mvPublicationOptions(root);
      assertSingleLocalPolicy(root, policyPath, publication);
      const emitted = emitCrlTwoLane(policyPath, publication), digest = definitionClosureDigest(emitted);
      if (!digest) throw new Error('Current definitions cannot compile completely.');
      const scratch = join(resolve(scratchRoot), randomUUID());
      const r=relative(resolve(root),scratch);
      if (!isAbsolute(r) && r!=='..' && !r.startsWith('..'+sep)) throw new Error('Freshness scratch must be outside the policy.');
      assertOrdinaryEditPath(scratchRoot);mkdirSync(resolve(scratchRoot),{recursive:true});assertOrdinaryEditPath(scratchRoot);
      const owner=realpathSync(resolve(scratchRoot));mkdirSync(scratch);
      let value: DefinitionFreshness;
      try {
        writeTwoLane(emitted, join(scratch, 'src'));
        const drift = ['cql', 'fhir'].flatMap(lane => generatedDefinitionDrift(readEditTree(join(root, 'src', lane)), readEditTree(join(scratch, 'src', lane)), join(root, 'src', lane)));
        value = drift.length ? { state: 'drift', digest, message: 'Generated definitions differ from the current CRL. A direct Save will regenerate this policy; current Pass is unavailable.' } : { state: 'current', digest };
      } finally { assertOrdinaryEditPath(scratch);if(realpathSync(resolve(scratchRoot))!==owner || realpathSync(scratch)!==join(owner,scratch.split(/[\\/]/).at(-1)!))throw new Error('Freshness scratch ownership changed.');rmSync(scratch, { recursive: true, force: true }); }
      this.cached = { key, value }; return value;
    } catch (error) { return { state: 'unknown', message: String(error instanceof Error ? error.message : error) }; }
  }
}
