import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Transformer regression test: IMMZ example', () => {
  const TMP_FILE = path.join(__dirname, 'testdata', 'smart-example-immz-regression-actual.cpg');
  const EXPECTED_FILE = path.join(__dirname, 'testdata', 'smart-example-immz-regression-expected.cpg');
  const MARKER = '// Instance: IMMZD2DTMeaslesDose0';

  it('should match the expected CPG-L output (ignoring header)', () => {
    // Run the transformer CLI and capture output
    const output = execSync('npm run cli:transformer:fsh-to-cpgl', { encoding: 'utf8' });
    fs.writeFileSync(TMP_FILE, output, 'utf8');

    // Read both files
    const actual = fs.readFileSync(TMP_FILE, 'utf8');
    const expected = fs.readFileSync(EXPECTED_FILE, 'utf8');

    // Find the marker in both files
    const actualStart = actual.indexOf(MARKER);
    const expectedStart = expected.indexOf(MARKER);
    expect(actualStart).toBeGreaterThanOrEqual(0);
    expect(expectedStart).toBeGreaterThanOrEqual(0);

    const actualBody = actual.slice(actualStart).replace(/\r\n/g, '\n');
    const expectedBody = expected.slice(expectedStart).replace(/\r\n/g, '\n');

    // Compare including whitespace
    expect(actualBody).toBe(expectedBody);
  });
}); 