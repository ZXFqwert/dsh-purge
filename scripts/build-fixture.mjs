// Create a disposable file-only fixture from explicitly selected local targets.
import fs from 'node:fs';
import path from 'node:path';
import { targetFiles } from '../lib/core.js';

const runtime = fs.realpathSync(process.env.DSH_RUNTIME_ROOT);
const base = fs.realpathSync(process.env.DSH_BASE);
const home = fs.realpathSync(process.env.DSH_HOME);
const dest = process.env.DSH_FIXTURE_ROOT;
if (!dest || !path.isAbsolute(dest) || fs.existsSync(dest)) throw new Error('DSH_FIXTURE_ROOT must be a new absolute path');
const within = (p, root) => { const rel = path.relative(root, p); return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); };
if (!within(base, runtime) || within(path.resolve(dest), runtime)) throw new Error('Unsafe fixture paths');
const targets = targetFiles(base, home);
let copied = 0;
for (const value of Object.values(targets)) {
  for (const fp of (Array.isArray(value) ? value : value ? [value] : [])) {
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) continue;
    const real = fs.realpathSync(fp);
    if (!within(real, runtime)) continue;
    const target = path.join(dest, 'runtime', path.relative(runtime, real));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) { fs.copyFileSync(real, target, fs.constants.COPYFILE_EXCL); copied++; }
  }
}
fs.mkdirSync(path.join(dest, 'home'), { recursive: true });
console.log(JSON.stringify({ fixture: dest, copiedFiles: copied }, null, 2));
