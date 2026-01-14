import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/api/server.js';

function listen(app) {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('GET /api/protons returns versions and default', async () => {
  const fake = {
    listInstalledVersions: async () => ['ge-8-1'],
    getDefaultVersion: async () => 'ge-8-1',
  };
  const app = createApp(fake);
  const { server, url } = await listen(app);
  const res = await fetch(url + '/api/protons');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { versions: ['ge-8-1'], default: 'ge-8-1' });
  server.close();
});

test('POST /api/protons/install calls installFromUrl', async () => {
  let called = null;
  const fake = {
    installFromUrl: async (v, u, s) => { called = { v, u, s }; return; },
  };
  const app = createApp(fake);
  const { server, url } = await listen(app);
  const res = await fetch(url + '/api/protons/install', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: 'v1', url: 'http://example.com/x.tar.gz', sha256: 'abc' }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.version, 'v1');
  assert.deepEqual(called, { v: 'v1', u: 'http://example.com/x.tar.gz', s: 'abc' });
  server.close();
});

test('DELETE /api/protons/:version calls removeVersion', async () => {
  let called = null;
  const fake = { removeVersion: async (v) => { called = v; } };
  const app = createApp(fake);
  const { server, url } = await listen(app);
  const res = await fetch(url + '/api/protons/v1', { method: 'DELETE' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { removed: 'v1' });
  assert.equal(called, 'v1');
  server.close();
});

test('POST /api/protons/:version/set-default calls setDefaultVersion', async () => {
  let called = null;
  const fake = { setDefaultVersion: async (v) => { called = v; } };
  const app = createApp(fake);
  const { server, url } = await listen(app);
  const res = await fetch(url + '/api/protons/v1/set-default', { method: 'POST' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { default: 'v1' });
  assert.equal(called, 'v1');
  server.close();
});
