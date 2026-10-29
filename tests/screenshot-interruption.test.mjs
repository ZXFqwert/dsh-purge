import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { RedteamStore, dispatch } from '../lib/redteam/store-core.js';

test('detects without deleting a screenshot orphan after abrupt exit', () => {
  const root = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'dsh-shot-interrupt-'));
  const home = path.join(root, 'home');
  const base = path.join(root, 'runtime', 'node_modules', '@deepseek-ai');
  fs.mkdirSync(path.join(base, 'dsh-agent-instructions', 'lib'), { recursive: true });
  fs.mkdirSync(home);
  const keys = ['DSH_HOME', 'DSH_BASE', 'DSH_PURGE_LAB_ROOT', 'DSH_PURGE_ISOLATED'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { DSH_HOME: home, DSH_BASE: base, DSH_PURGE_LAB_ROOT: root, DSH_PURGE_ISOLATED: '1' });
  let store;
  try {
    const redteamRoot = path.join(home, 'redteam');
    store = new RedteamStore(redteamRoot);
    store.openEngagement('interrupt-test', []);
    store.addShot('interrupt-test', { file: 'indexed.png', data_base64: Buffer.from('LAB_INDEXED').toString('base64') });
    store.close();
    store = null;
    const moduleUrl = new URL('../lib/redteam/store-core.js', import.meta.url).href;
    const childProgram = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.writeFileSync;
      fs.writeFileSync = (target, ...args) => {
        if (typeof target === 'number') { original(target, ...args); process.exit(91); }
        return original(target, ...args);
      };
      syncBuiltinESMExports();
      const { RedteamStore } = await import(${JSON.stringify(moduleUrl)});
      const store = new RedteamStore(process.env.LAB_REDTEAM_ROOT);
      store.addShot('interrupt-test', { file: 'interrupted.png', data_base64: Buffer.from('LAB_INTERRUPTED').toString('base64') });
      process.exit(92);
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', childProgram], {
      env: { ...process.env, LAB_REDTEAM_ROOT: redteamRoot }, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(child.status, 91, child.stderr);
    const file = path.join(redteamRoot, 'engagements', 'interrupt-test', 'shots', 'interrupted.png');
    assert.equal(fs.readFileSync(file, 'utf8'), 'LAB_INTERRUPTED');
    store = new RedteamStore(redteamRoot);
    assert.equal(store.listShots('interrupt-test').items.some((shot) => shot.file === 'interrupted.png'), false);
    const linkTarget = path.join(home, 'link-target');
    fs.mkdirSync(linkTarget);
    fs.symlinkSync(linkTarget, path.join(path.dirname(file), 'directory-link'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.deepEqual(store.listShotOrphans('interrupt-test'), { items: [{ file: 'interrupted.png' }], total: 1 });
    assert.deepEqual(dispatch(store, { op: 'shotOrphans', engagement: 'interrupt-test' }), { ok: true, items: [{ file: 'interrupted.png' }], total: 1 });
    assert.equal(fs.readFileSync(file, 'utf8'), 'LAB_INTERRUPTED');
    assert.equal(fs.readFileSync(path.join(path.dirname(file), 'indexed.png'), 'utf8'), 'LAB_INDEXED');
    fs.unlinkSync(path.join(path.dirname(file), 'directory-link'));
  } finally {
    store?.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
