import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveRule } from '../lib/rules.js';
import { saveSkill, importArchive } from '../lib/skills.js';
import { atomicWriteFile, findDshHome } from '../lib/core.js';

test('isolated rules and skills reject junctions outside the lab', async () => {
  const root = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'dsh-isolated-root-'));
  const outside = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'dsh-isolated-outside-'));
  const home = path.join(root, 'home');
  const base = path.join(root, 'runtime', 'node_modules', '@deepseek-ai');
  fs.mkdirSync(path.join(base, 'dsh-agent-instructions', 'lib'), { recursive: true });
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'unchanged');
  const previous = Object.fromEntries(['DSH_HOME', 'DSH_BASE', 'DSH_PURGE_LAB_ROOT', 'DSH_PURGE_ISOLATED'].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { DSH_HOME: home, DSH_BASE: base, DSH_PURGE_LAB_ROOT: root, DSH_PURGE_ISOLATED: '1' });
  const kind = process.platform === 'win32' ? 'junction' : 'dir';
  try {
    fs.symlinkSync(outside, path.join(home, 'skills'), kind);
    await assert.rejects(saveSkill(home, 'test-skill', '---\nname: test-skill\ndescription: Test\n---\nBody\n'), /escapes lab root/);
    fs.unlinkSync(path.join(home, 'skills'));
    fs.symlinkSync(outside, path.join(home, 'rules'), kind);
    await assert.rejects(saveRule(home, 'example', 'test', {}), /escapes lab root/);
    await assert.rejects(atomicWriteFile(path.join(home, 'rules', 'x.md'), 'test'), /escapes lab root/);
    await assert.rejects(importArchive(home, Buffer.from('invalid'), 'test.zip'), /disabled in isolated mode/);
    assert.equal(fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8'), 'unchanged');
    assert.equal(findDshHome(), fs.realpathSync(home));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    try { fs.unlinkSync(path.join(home, 'rules')); } catch {}
    try { fs.unlinkSync(path.join(home, 'skills')); } catch {}
    fs.unlinkSync(path.join(outside, 'sentinel.txt'));
    fs.rmdirSync(outside);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
