// REFACTOR:grounded (Medical Review): registry identity and publication metadata share one package read.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CRLError } from '../types/errors';

export interface PackageSnapshot { raw?: unknown; errors: CRLError[] }
export function readPackageSnapshot(projectRoot: string): PackageSnapshot {
  const file = join(projectRoot, 'package.json');
  let text: string;
  try { text = readFileSync(file, 'utf8'); }
  catch (error) { return { errors: [{ type: 'Exception', kind: 'unreadable-package-json', message: `Cannot read ${file}: ${(error as Error).message}` }] }; }
  try { return { raw: JSON.parse(text), errors: [] }; }
  catch (error) { return { errors: [{ type: 'Exception', kind: 'unreadable-package-json', message: `Cannot parse ${file}: ${(error as Error).message}` }] }; }
}
