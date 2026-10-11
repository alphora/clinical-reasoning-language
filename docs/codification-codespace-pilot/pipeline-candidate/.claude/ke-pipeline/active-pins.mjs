import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultAccepted = path.join(here, 'pins.json');
const defaultLocal = path.resolve(here, '../../tmp/runtime/pins.local.json');

export function loadPins({ acceptedPath = defaultAccepted, localPath = defaultLocal } = {}) {
  const accepted = JSON.parse(fs.readFileSync(acceptedPath, 'utf8'));
  if (!fs.existsSync(localPath)) return accepted;
  const bound = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  for (const key of ['crlVersion', 'kitSchema', 'kitHash']) {
    if (bound[key] !== accepted[key]) throw new Error(`local runtime identity mismatch: ${key}`);
  }
  for (const key of ['server', 'driver', 'engine']) {
    if (bound[key]?.sha256 !== accepted[key]?.sha256) {
      throw new Error(`local runtime identity mismatch: ${key}.sha256`);
    }
  }
  return bound;
}
