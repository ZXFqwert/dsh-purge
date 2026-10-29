import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizePluginRoute } from '../lib/index.js';

function response() {
  return { code: null, body: '', writeHead(code) { this.code = code; }, end(body) { this.body = body; } };
}

test('plugin routes reject unauthenticated, unavailable, and untrusted requests', () => {
  for (const [connection, expected] of [
    [null, 503],
    [{ requestRejection: () => 401 }, 401],
    [{ requestRejection: () => 403 }, 403],
    [{ requestRejection: () => { throw new Error('unavailable'); } }, 503],
  ]) {
    const res = response();
    assert.equal(authorizePluginRoute({}, res, connection), false);
    assert.equal(res.code, expected);
  }
});

test('plugin routes allow requests accepted by the host', () => {
  const res = response();
  const request = { headers: { cookie: 'not-a-real-cookie' } };
  const connection = { requestRejection: (actual) => actual === request ? undefined : 401 };
  assert.equal(authorizePluginRoute(request, res, connection), true);
  assert.equal(res.code, null);
});
