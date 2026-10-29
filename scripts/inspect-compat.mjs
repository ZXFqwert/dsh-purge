// Read-only inventory of patch matches against an explicitly selected DSH install.
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.DSH_BASE;
const home = process.env.DSH_HOME;
if (!base || !home || !path.isAbsolute(base) || !path.isAbsolute(home)) {
  throw new Error('Set absolute DSH_BASE and DSH_HOME explicitly before running this check.');
}
if (!fs.existsSync(path.join(base, 'dsh-agent-instructions', 'lib'))) {
  throw new Error('DSH_BASE must point to the target @deepseek-ai package directory.');
}

const { ALL_PATCHES, patchStatus, groupPatchesForDisplay, tallyDisplayPatches } = await import('../lib/core.js');
const status = await patchStatus(base);
const rows = groupPatchesForDisplay(ALL_PATCHES, status, 'web');
const patches = rows.map((row) => ({
  id: row.id,
  name: ALL_PATCHES.find((patch) => patch.id === row.id)?.name ?? null,
  status: row.status,
}));
console.log(JSON.stringify({ base: fs.realpathSync(base), home: path.resolve(home), counts: tallyDisplayPatches(rows), patches }, null, 2));
