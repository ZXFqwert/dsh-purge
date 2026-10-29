import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { backupAll, revertAll } from '../lib/core.js';

test('exclusive backups can be restored and are not overwritten', async () => {
  const root = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'dsh-backup-test-'));
  const base = path.join(root, 'runtime', 'node_modules', '@deepseek-ai');
  const home = path.join(root, 'home');
  const source = path.join(base, 'dsh-agent-instructions', 'lib', 'index.js');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(source, 'original\n');
  Object.assign(process.env, { DSH_PURGE_ISOLATED: '1', DSH_PURGE_LAB_ROOT: root, DSH_BASE: base, DSH_HOME: home });
  const first = await backupAll(base);
  assert.equal(first.errors.length, 0);
  assert.ok(first.made.includes(source + '.dshpurge.bak'));
  fs.writeFileSync(source, 'modified\n');
  const second = await backupAll(base);
  assert.equal(second.errors.length, 0);
  assert.equal(fs.readFileSync(source + '.dshpurge.bak', 'utf8'), 'original\n');
  const restored = await revertAll(base);
  assert.equal(restored.errors.length, 0);
  assert.equal(fs.readFileSync(source, 'utf8'), 'original\n');
});

test('apply aborts without changing target if backups cannot be created', () => {
  const root = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'dsh-backup-denied-'));
  const base = path.join(root, 'runtime', 'node_modules', '@deepseek-ai');
  const home = path.join(root, 'home');
  const source = path.join(base, 'dsh-agent-instructions', 'lib', 'index.js');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(source, 'original\n');
  const env = { ...process.env, DSH_PURGE_ISOLATED: '1', DSH_PURGE_LAB_ROOT: root, DSH_BASE: base, DSH_HOME: home };
  const coreUrl = new URL('../lib/core.js', import.meta.url).href;
  const program = `import { applyPatchesAllHosts } from ${JSON.stringify(coreUrl)}; await applyPatchesAllHosts([], { forApply: true });`;
  const result = spawnSync(process.execPath, ['--permission', '--allow-fs-read=*', '--input-type=module', '-e', program], { env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /backup failed/);
  assert.equal(fs.readFileSync(source, 'utf8'), 'original\n');
});
