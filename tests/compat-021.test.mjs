import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { ALL_PATCHES, applyReplacementsToText } from '../lib/core.js';

const base = process.env.DSH_BASE;
if (!base) throw new Error('Set DSH_BASE to the experimental @deepseek-ai directory');
const patch = (id) => ALL_PATCHES.find((item) => item.id === id);

test('0.2.1 complete prompt keeps required contexts', async () => {
  const src = fs.readFileSync(path.join(base, 'dsh-system-prompt/lib/index.js'), 'utf8');
  const replacement = patch(40).replacements.find((item) => item.pattern instanceof RegExp && item.pattern.test(src));
  assert.ok(replacement, 'version-specific pattern must match');
  const source = replacement.replace.trim();
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const invoke = new AsyncFunction('scopeTarget', 'scope', 'assembly', 'context', 'completeSection', 'runtimeContextSuppressed', 'contextByName', source);
  const transformed = { sections: [{ name: 'dsh-purge', text: 'test' }], contexts: [{ name: 'required' }, { name: 'optional' }] };
  const host = { ctx: { waterfall: async () => transformed } };
  const contextByName = new Map([['required', { name: 'required', required: true }], ['optional', { name: 'optional' }]]);
  const result = await invoke.call(host, () => null, null, null, null, { name: 'complete', text: 'body' }, true, contextByName);
  assert.deepEqual(result.contexts, [{ name: 'required' }]);
  assert.equal(result.sections[0].name, 'dsh-purge');
  assert.equal(result.sections.at(-1).name, 'complete');
  const ordinary = await invoke.call(host, () => null, null, null, null, undefined, false, contextByName);
  assert.equal(ordinary.contexts.length, 2);
});

test('0.2.1 rewind append pattern matches exactly once', () => {
  const src = fs.readFileSync(path.join(base, 'dsh-client-ui-conversation/lib/client.js'), 'utf8');
  const matches = patch(77).replacements.filter((item) => typeof item.pattern === 'string' && src.includes(item.pattern));
  assert.equal(matches.length, 1);
  assert.equal(src.split(matches[0].pattern).length - 1, 1);
  assert.match(matches[0].replace, /if \(this\.revised\.size > 0\) this\.revised\.clear\(\)/);
});

for (const [id, file] of [
  [32, 'dsh-web-app/lib/index.js'],
  [40, 'dsh-system-prompt/lib/index.js'],
  [77, 'dsh-client-ui-conversation/lib/client.js'],
]) {
  test(`patch ${id} produces parseable JavaScript and is idempotent`, () => {
    const sourcePath = path.join(base, file);
    const original = fs.readFileSync(sourcePath, 'utf8');
    const first = applyReplacementsToText(original, patch(id), sourcePath);
    assert.equal(first.changed, true);
    const second = applyReplacementsToText(first.text, patch(id), sourcePath);
    assert.equal(second.changed, false);
    const tempRoot = process.env.TEMP || os.tmpdir();
    const tempFile = path.join(tempRoot, `dsh-purge-compat-${id}-${process.pid}.mjs`);
    fs.writeFileSync(tempFile, first.text, { flag: 'wx' });
    try {
      const result = spawnSync(process.execPath, ['--check', tempFile], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    } finally {
      fs.unlinkSync(tempFile);
    }
  });
}
