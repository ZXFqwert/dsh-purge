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

test('redteam attachments and knowledge files reject outside junctions', () => {
  const temp = process.env.TEMP || os.tmpdir();
  const root = fs.mkdtempSync(path.join(temp, 'dsh-redteam-files-'));
  const outside = fs.mkdtempSync(path.join(temp, 'dsh-redteam-external-'));
  const home = path.join(root, 'home');
  const base = path.join(root, 'runtime', 'node_modules', '@deepseek-ai');
  fs.mkdirSync(path.join(base, 'dsh-agent-instructions', 'lib'), { recursive: true });
  fs.mkdirSync(home);
  const keys = ['DSH_HOME', 'DSH_BASE', 'DSH_PURGE_LAB_ROOT', 'DSH_PURGE_ISOLATED'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { DSH_HOME: home, DSH_BASE: base, DSH_PURGE_LAB_ROOT: root, DSH_PURGE_ISOLATED: '1' });
  const kind = process.platform === 'win32' ? 'junction' : 'dir';
  let store;
  const links = [];
  const link = (target) => { fs.symlinkSync(outside, target, kind); links.push(target); };
  try {
    store = new RedteamStore(path.join(home, 'redteam'));
    store.openEngagement('lab-files', []);
    const db = store.db('lab-files');
    const beforeRuns = db.prepare('SELECT COUNT(*) AS n FROM scan_run').get().n;
    assert.throws(() => store.importBundle('lab-files', {
      scan: { tool: 'lab-only' },
      assets: [{ ip: '192.0.2.1', names: [{ name: null }] }],
    }));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM scan_run').get().n, beforeRuns);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM asset').get().n, 0);
    const imported = store.importBundle('lab-files', { scan: { tool: 'lab-only' }, assets: [{ ip: '192.0.2.1' }] });
    assert.equal(imported.counts.assets, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM scan_run').get().n, beforeRuns + 1);
    store.savePrompt('lab-files', 'recon', 'LAB_CUSTOM_PROMPT');
    assert.equal(store.listPrompts('lab-files').find((item) => item.role === 'recon').content, 'LAB_CUSTOM_PROMPT');
    const promptDir = store.promptsDirOf('lab-files');
    const parkedPrompts = promptDir + '-parked';
    fs.renameSync(promptDir, parkedPrompts);
    link(promptDir);
    assert.throws(() => store.savePrompt('lab-files', 'recon', 'blocked'), /escapes lab root/);
    fs.unlinkSync(promptDir);
    links.pop();
    fs.renameSync(parkedPrompts, promptDir);
    assert.equal(store.listPrompts('lab-files').find((item) => item.role === 'recon').content, 'LAB_CUSTOM_PROMPT');
    const shot = store.addShot('lab-files', { file: 'lab.png', data_base64: Buffer.from('lab-shot').toString('base64') });
    assert.ok(shot);
    const shotsDir = store.shotsDirOf('lab-files');
    const parkedShots = shotsDir + '-parked';
    fs.renameSync(shotsDir, parkedShots);
    link(shotsDir);
    assert.throws(() => store.deleteShot('lab-files', shot.id), /escapes lab root/);
    assert.ok(store.listShots('lab-files').items.some((item) => item.id === shot.id));
    fs.unlinkSync(shotsDir);
    links.pop();
    fs.renameSync(parkedShots, shotsDir);
    const saved = store.savePoc({ title: 'Lab entry', code: 'lab-entry', content: 'LAB_KNOWLEDGE' });
    assert.equal(fs.readFileSync(saved.path, 'utf8'), 'LAB_KNOWLEDGE');
    assert.ok(store.searchPocs({ q: 'Lab entry' }).some((item) => item.code === 'lab-entry'));
    const pocDir = path.join(store.pocsDirOf(), 'lab-entry');
    const parkedPoc = pocDir + '-parked';
    fs.renameSync(pocDir, parkedPoc);
    link(pocDir);
    assert.throws(() => store.deletePoc('lab-entry'), /escapes lab root/);
    assert.equal(store.getPoc('lab-entry').content, 'LAB_KNOWLEDGE');
    fs.unlinkSync(pocDir);
    links.pop();
    fs.renameSync(parkedPoc, pocDir);
    assert.equal(store.deletePoc('lab-entry').deleted, true);
    assert.equal(store.getPoc('lab-entry'), undefined);
    assert.equal(fs.existsSync(pocDir), false);
    assert.throws(() => store.addAttackFile('lab-files', { target: '..', name: 'blocked.txt', evidence: 'lab', content: 'blocked' }), /outside|escape|path/i);
    assert.equal(fs.existsSync(path.join(store.dirOf('lab-files'), 'blocked.txt')), false);
    link(path.join(store.pocsDirOf(), 'external'));
    assert.throws(() => store.savePoc({ title: 'External', code: 'external', content: 'blocked' }), /escapes lab root/);
    const externalShot = store.openEngagement('lab-shot-link', []);
    assert.ok(externalShot);
    link(store.shotsDirOf('lab-shot-link'));
    assert.throws(() => store.addShot('lab-shot-link', { file: 'blocked.png', data_base64: 'eA==' }), /escapes lab root/);
    link(store.attackFilesDirOf('lab-shot-link'));
    assert.throws(() => store.addAttackFile('lab-shot-link', { target: '127.0.0.1', name: 'blocked.txt', evidence: 'lab', content: 'blocked' }), /escapes lab root/);
    const other = new RedteamStore(path.join(home, 'knowledge-link'));
    link(other.knowledgePath());
    try { assert.throws(() => other.kb(), /escapes lab root/); } finally { other.close(); }
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally {
    store?.close();
    for (const target of links) fs.unlinkSync(target);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmdirSync(outside);
  }
});
