import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installBundledSkills } from '../lib/redteam/index.js';
import { RedteamStore } from '../lib/redteam/store-core.js';
import { writeSettings } from '../lib/redteam/settings.js';
import { handleUpdateOp } from '../lib/redteam/ui.js';

test('isolated redteam updater rejects checks and installs before preflight', async () => {
  const previous = process.env.DSH_PURGE_ISOLATED;
  process.env.DSH_PURGE_ISOLATED = '1';
  const ctx = { redteam: { plugin: { name: 'dsh-purge', version: '1.1.71' } }, get() { throw new Error('preflight must not run'); } };
  try {
    for (const op of ['updateCheck', 'updateApply']) {
      const result = await handleUpdateOp(ctx, { op, target: '1.1.71' });
      assert.equal(result.ok, false);
      assert.match(result.error, /disabled in isolated/);
    }
    const version = await handleUpdateOp(ctx, { op: 'version' });
    assert.equal(version.ok, true);
    assert.equal(version.install.mode, 'isolated');
  } finally {
    if (previous === undefined) delete process.env.DSH_PURGE_ISOLATED; else process.env.DSH_PURGE_ISOLATED = previous;
  }
});

test('isolated redteam does not sync to the ordinary user home or follow escaping junctions', () => {
  const root = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'dsh-redteam-lab-'));
  const outside = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'dsh-redteam-outside-'));
  const home = path.join(root, 'home');
  const base = path.join(root, 'runtime', 'node_modules', '@deepseek-ai');
  fs.mkdirSync(path.join(base, 'dsh-agent-instructions', 'lib'), { recursive: true });
  fs.mkdirSync(home);
  fs.mkdirSync(path.join(outside, '.dsh'), { recursive: true });
  const keys = ['DSH_HOME', 'DSH_BASE', 'DSH_PURGE_LAB_ROOT', 'DSH_PURGE_ISOLATED', 'USERPROFILE', 'HOME'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { DSH_HOME: home, DSH_BASE: base, DSH_PURGE_LAB_ROOT: root, DSH_PURGE_ISOLATED: '1', USERPROFILE: outside, HOME: outside });
  let store;
  try {
    const sync = installBundledSkills();
    assert.deepEqual(sync.targets, [path.join(home, 'redteam', 'skills')]);
    assert.equal(fs.existsSync(path.join(outside, '.dsh', 'redteam')), false);
    store = new RedteamStore(path.join(home, 'redteam'));
    store.openEngagement('lab-test', []);
    assert.equal(store.db('lab-test').prepare('SELECT 1 AS value').get().value, 1);
    assert.ok(store.listEngagements().some((item) => item.id === 'lab-test'));
    store.saveStage('lab-test', { code: 'custom-stage', goal: 'LAB_PERSISTED' });
    store.close();
    store = new RedteamStore(path.join(home, 'redteam'));
    assert.ok(store.listStages('lab-test').some((item) => item.code === 'custom-stage' && item.goal === 'LAB_PERSISTED'));
    const link = path.join(store.engagementsDir, 'external');
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => store.db('external', { create: true }), /escapes lab root/);
    assert.throws(() => writeSettings(outside, { example: 1 }), /escapes lab root/);
    assert.equal(fs.existsSync(path.join(outside, 'settings.json')), false);
    fs.unlinkSync(link);
  } finally {
    store?.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
