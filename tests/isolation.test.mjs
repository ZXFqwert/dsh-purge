import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { enumeratePatchAiBases, listShimDirsForPatch, findShimDir, findDesktopShimDir, findDshBinRoot, patchShim, revertShim, sanitizeDesktopCommandRuntimes, silenceCmdFlash, stubDoctorSupervisor, applyPatches, openSealedDesktopHost, desktopAsarStillSealed, repairOfficialCliAfterUnpack } from '../lib/core.js';
import { portFromRequest, isolatedExecArgs, restartArgv, scheduleRestart } from '../lib/web.js';
import { applyUpdate, switchChannel, switchVersion, handleUpdateOp } from '../lib/update.js';
import { uninstallPurge } from '../lib/uninstall.js';

test('isolated mode limits host discovery and disables global maintenance', () => {
  const base = process.env.DSH_BASE;
  const root = process.env.DSH_PURGE_LAB_ROOT;
  assert.equal(process.env.DSH_PURGE_ISOLATED, '1');
  assert.ok(base && root && process.env.DSH_HOME);
  assert.deepEqual(enumeratePatchAiBases({ discover: true }), [fs.realpathSync(base)]);
  assert.deepEqual(listShimDirsForPatch(), []);
  assert.deepEqual(sanitizeDesktopCommandRuntimes(), []);
  assert.equal(stubDoctorSupervisor().skipped, 'isolated');
  assert.equal(silenceCmdFlash(base).entry, 'isolated-skip');
  const previous = process.env.DSH_BASE;
  try {
    process.env.DSH_BASE = path.parse(root).root;
    assert.throws(() => enumeratePatchAiBases({ discover: true }), /outside the lab root/);
  } finally {
    process.env.DSH_BASE = previous;
  }
});

test('isolated mode rejects an explicit target outside the selected installation', async () => {
  await assert.rejects(applyPatches(process.env.DSH_HOME, []), /rejected non-lab DSH target/);
});

test('isolated mode never extracts desktop archives', async () => {
  assert.equal(desktopAsarStillSealed(), false);
  const result = await openSealedDesktopHost({ forApply: true });
  assert.equal(result.aiBase, fs.realpathSync(process.env.DSH_BASE));
  assert.equal(result.extracted, false);
  assert.equal(result.swapAsar, false);
});

test('isolated mode refuses direct shim operations', async () => {
  assert.equal(findShimDir(), null);
  assert.equal(findDesktopShimDir(), null);
  assert.deepEqual(await patchShim(process.env.DSH_HOME), { skipped: 'isolated' });
  assert.deepEqual(await revertShim(process.env.DSH_HOME), { skipped: 'isolated' });
});

test('isolated web restart uses the selected runtime and preserves port and node flags', () => {
  const bin = findDshBinRoot();
  assert.equal(fs.realpathSync(bin), fs.realpathSync(path.join(process.env.DSH_BASE, 'dsh')));
  const argv = ['node', path.join(bin, 'lib', 'bin.js'), 'web', '--port', '3085'];
  assert.equal(portFromRequest(null, { argv, env: {} }), 3085);
  assert.equal(portFromRequest(null, { argv: [...argv.slice(0, 3), '--port=3086'], env: {} }), 3086);
  assert.equal(portFromRequest({ headers: { host: '127.0.0.1:3087' } }, { argv, env: {} }), 3087);
  assert.deepEqual(isolatedExecArgs({ DSH_PURGE_ISOLATED: '1' }, ['--permission', '--allow-child-process']), ['--permission', '--allow-child-process']);
  assert.deepEqual(isolatedExecArgs({}, ['--permission']), []);
  assert.ok(restartArgv({ argv }).includes('3085'));
  assert.deepEqual(repairOfficialCliAfterUnpack(), { ok: true, skipped: 'isolated' });
});

test('web restart reports scheduling failures and successes', () => {
  let payload;
  const result = scheduleRestart({ headers: { host: '127.0.0.1:3085' } }, null, { openBrowser: false, spawnHelper: (_helper, info) => { payload = info; } });
  assert.deepEqual(result, { restarting: true });
  assert.equal(payload.port, 3085);
  assert.equal(payload.openBrowser, false);
  const failure = scheduleRestart(null, null, { spawnHelper: () => { throw new Error('spawn denied'); } });
  assert.deepEqual(failure, { restarting: false, error: 'spawn denied' });
});

test('isolated mode blocks destructive updater and uninstall entry points', async () => {
  await assert.rejects(applyUpdate(), /disabled in isolated development mode/);
  await assert.rejects(switchChannel('stable'), /disabled in isolated development mode/);
  await assert.rejects(switchVersion('v1.1.71'), /disabled in isolated development mode/);
  await assert.rejects(handleUpdateOp({ op: 'apply' }), /disabled in isolated development mode/);
  const result = await uninstallPurge();
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /disabled in isolated development mode/);
});

test('isolated mode rejects a junction pointing outside the lab', () => {
  const original = { root: process.env.DSH_PURGE_LAB_ROOT, base: process.env.DSH_BASE, home: process.env.DSH_HOME };
  const root = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'dsh-junction-test-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  const link = path.join(root, 'external-base');
  fs.symlinkSync(original.base, link, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    Object.assign(process.env, { DSH_PURGE_LAB_ROOT: root, DSH_BASE: link, DSH_HOME: home });
    assert.throws(() => enumeratePatchAiBases(), /outside the lab root/);
  } finally {
    Object.assign(process.env, { DSH_PURGE_LAB_ROOT: original.root, DSH_BASE: original.base, DSH_HOME: original.home });
    fs.unlinkSync(link);
    fs.rmdirSync(home);
    fs.rmdirSync(root);
  }
});
