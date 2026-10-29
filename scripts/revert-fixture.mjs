import fs from 'node:fs';
import path from 'node:path';
import { revertAllHosts } from '../lib/core.js';

const fixture = fs.realpathSync(process.env.DSH_FIXTURE_ROOT);
const base = fs.realpathSync(process.env.DSH_BASE);
const relative = path.relative(fixture, base);
if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Target is outside fixture');
if (!process.permission || process.permission.has('child') || process.permission.has('fs.write', path.dirname(fixture))) throw new Error('Fixture permissions required');
const result = await revertAllHosts({ discover: true });
console.log(JSON.stringify({ reverted: result.reverted.length, errors: result.errors }, null, 2));
if (result.errors.length) process.exitCode = 1;
