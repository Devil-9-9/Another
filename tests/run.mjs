// Run every test:  node tests/run.mjs      (each *.test.mjs is a plain script; console.assert failures print "Assertion failed")
import { readdirSync } from 'node:fs'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import path from 'node:path';
const dir = path.dirname(fileURLToPath(import.meta.url)); let failed = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.test.mjs')).sort()) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', timeout: 280000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const bad = r.status !== 0 || /Assertion failed/.test(out);
  console.log((bad ? 'FAIL ' : 'ok   ') + f); if (bad) { failed++; console.log(out.split('\n').map((l) => '     ' + l).join('\n')); }
}
console.log(failed ? `\n${failed} test file(s) failed` : '\nall tests passed'); process.exit(failed ? 1 : 0);
