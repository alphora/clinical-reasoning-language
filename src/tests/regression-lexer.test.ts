import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Lexer regression test: IMMZ example', () => {
  const TMP_FILE = path.join(__dirname, 'testdata', 'regression-lexer-actual.tokens');
  const EXPECTED_FILE = path.join(__dirname, 'testdata', 'regression-lexer-expected.tokens');
  const MARKER = '[';

    const isCI = process.env.CI === 'true';
    
    //TODO: figure out how to get this to work in CI
    (isCI ? it.skip : it)('should match the expected lexer output (ignoring header)', () => {
    // Run the lexer CLI and capture output
    const output = execSync('npm run cli:lexer -- ' + path.join(__dirname, 'testdata', 'smart-example-immz'), { encoding: 'utf8' });
    fs.writeFileSync(TMP_FILE, output, 'utf8');

    // Read both files
    const actual = fs.readFileSync(TMP_FILE, 'utf8');
    const expected = fs.readFileSync(EXPECTED_FILE, 'utf8');

    // Find the marker in both files
    const actualStart = actual.indexOf(MARKER);
    const expectedStart = expected.indexOf(MARKER);
    expect(actualStart).toBeGreaterThanOrEqual(0);
    expect(expectedStart).toBeGreaterThanOrEqual(0);

    const actualBody = actual.slice(actualStart).replace(/\r\n/g, '\n').trimEnd();
    const expectedBody = expected.slice(expectedStart).replace(/\r\n/g, '\n').trimEnd();

    // Compare including whitespace
    expect(actualBody).toBe(expectedBody);
  });
}); 