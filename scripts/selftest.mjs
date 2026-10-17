#!/usr/bin/env node
// Builds dist/selftest.dg and runs it in the real Deluge runtime on the jitspike harness.
// Exits non-zero unless the script ran and reported zero failures — a run that produced
// no SELFTEST line is a failure, not a pass.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [built] = buildAll(['selftest']);
let out;
try {
  out = execFileSync('node', [path.join(ROOT, 'scripts/spike.mjs'), built.dist], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (err) {
  console.error((err.stdout ?? '') + (err.stderr ?? ''));
  console.error('SELFTEST did not run.');
  process.exit(1);
}
const m = out.match(/SELFTEST passes=(\d+) fails=(\d+) (.*?)"\s*\n?\s*}/s);
if (!m) {
  console.error(out);
  console.error('SELFTEST produced no result line.');
  process.exit(1);
}
const [, passes, fails, detail] = m;
console.log(`selftest: ${passes} passed, ${fails} failed`);
if (Number(fails) > 0) {
  // The detail is Deluge's List.toString() inside a JSON string, so print it as text
  // rather than parsing it: failure text may itself contain quotes and brackets.
  console.log(`  FAIL ${detail.replace(/\\"/g, '"')}`);
  process.exit(1);
}
