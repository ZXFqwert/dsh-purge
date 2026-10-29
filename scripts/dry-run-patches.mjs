// Apply transformations in memory only; never write to the target installation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ALL_PATCHES, targetFiles, applyReplacementsToText } from '../lib/core.js';

const base = process.env.DSH_BASE;
const home = process.env.DSH_HOME;
const runtime = process.env.DSH_RUNTIME_ROOT;
if (!base || !home || !runtime || !path.isAbsolute(base) || !path.isAbsolute(home) || !path.isAbsolute(runtime)) throw new Error('Absolute DSH_BASE, DSH_HOME, and DSH_RUNTIME_ROOT are required');
const realBase = fs.realpathSync(base);
const realHome = fs.realpathSync(home);
const realRuntime = fs.realpathSync(runtime);
const isWithin = (p, root) => {
  const rel = path.relative(root, p);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
};
if (!isWithin(realBase, realRuntime)) throw new Error('DSH_BASE must be inside DSH_RUNTIME_ROOT');
const targets = targetFiles(realBase, realHome);
const changed = new Map();
const blocked = new Set();
for (const patch of ALL_PATCHES) {
  for (const key of (Array.isArray(patch.file) ? patch.file : [patch.file])) {
    const files = targets[key];
    for (const file of (Array.isArray(files) ? files : files ? [files] : [])) {
      if (!fs.existsSync(file)) continue;
      const real = fs.realpathSync(file);
      if (!isWithin(real, realRuntime) && !isWithin(real, realHome)) {
        blocked.add(real);
        continue;
      }
      const previous = changed.get(real)?.text ?? fs.readFileSync(real, 'utf8');
      const result = applyReplacementsToText(previous, patch, real);
      if (!result.changed) continue;
      const record = changed.get(real) ?? { text: previous, patches: [] };
      record.text = result.text;
      record.patches.push(patch.id);
      changed.set(real, record);
    }
  }
}
const checked = [];
for (const [file, data] of changed) {
  if (!/\.(?:js|mjs)$/i.test(file)) continue;
  const tmp = path.join(process.env.TEMP || os.tmpdir(), `dsh-dryrun-${process.pid}-${checked.length}.mjs`);
  fs.writeFileSync(tmp, data.text, { flag: 'wx' });
  try {
    const run = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    checked.push({ file, patches: data.patches, ok: run.status === 0, error: run.status === 0 ? undefined : run.stderr });
  } finally {
    fs.unlinkSync(tmp);
  }
}
const result = { base: realBase, home: realHome, modifiedFiles: changed.size, checkedJs: checked.length, failures: checked.filter((x) => !x.ok), blockedPaths: [...blocked] };
console.log(JSON.stringify(result, null, 2));
if (result.failures.length || result.blockedPaths.length) process.exitCode = 1;
