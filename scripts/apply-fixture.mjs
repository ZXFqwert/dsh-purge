// Run under Node's permission model with write access restricted to this fixture.
import fs from 'node:fs';
import path from 'node:path';
import { ALL_PATCHES, applyPatches, applyPatchesAllHosts } from '../lib/core.js';

const fixture = fs.realpathSync(process.env.DSH_FIXTURE_ROOT);
const base = fs.realpathSync(process.env.DSH_BASE);
const rel = path.relative(fixture, base);
if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error('Target is outside fixture');
if (!process.permission || process.permission.has('child') || process.permission.has('fs.write', path.dirname(fixture))) {
  throw new Error('Fixture test requires Node permissions: no child processes, no write outside fixture');
}
let report;
if (process.argv.includes('--all-hosts')) {
  const result = await applyPatchesAllHosts(ALL_PATCHES, { forApply: true });
  if (result.hosts.length !== 1 || fs.realpathSync(result.hosts[0].aiBase) !== base) throw new Error('Unexpected patch host');
  report = result.report;
} else {
  report = await applyPatches(base, ALL_PATCHES);
}
const counts = {};
for (const item of report) counts[item.status] = (counts[item.status] || 0) + 1;
console.log(JSON.stringify({ fixture, counts, failures: report.filter((x) => /failed|error|pattern_not_found/.test(x.status)).map(({ patch_id, name, status }) => ({ patch_id, name, status })) }, null, 2));
