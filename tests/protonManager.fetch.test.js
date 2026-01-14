import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import http from 'http';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as pm from '../src/protonManager/index.js';

test('fetchPublicKey from HTTP URL', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ugl-test-'));
  const pub = path.join(tmp, 'pub.asc');
  await fs.writeFile(pub, 'PUBLIC KEY DATA');

  const server = http.createServer((req, res) => {
    if (req.url === '/pub.asc') {
      res.writeHead(200, {'Content-Type': 'application/pgp-keys'});
      fs.readFile(pub).then(buf => res.end(buf)).catch(()=>res.end(''));
    } else {
      res.writeHead(404); res.end('');
    }
  });
  await new Promise((r, rej)=>{ server.once('error', rej); server.listen(0, r); });
  const port = server.address().port;

  const url = `http://127.0.0.1:${port}/pub.asc`;
  const fetched = await pm.fetchPublicKey(url);
  const got = await fs.readFile(fetched, 'utf8');
  assert.equal(got, 'PUBLIC KEY DATA');

  await new Promise((r)=>server.close(r));
});

// Test GitHub releases flow using a local server by overriding UGL_GITHUB_API_BASE
test('fetchPublicKey from github:owner/repo (local simulated release)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ugl-test-'));
  const pub = path.join(tmp, 'release_key.asc');
  await fs.writeFile(pub, 'GH RELEASE KEY');

  const server = http.createServer((req, res) => {
    if (req.url === '/repos/owner/repo/releases/latest') {
      // we'll substitute the actual chosen port later using server.address().port
      const body = JSON.stringify({assets: [{name: 'release_key.asc', browser_download_url: `http://127.0.0.1:${server.address().port}/release_key.asc`}]});
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(body);
    } else if (req.url === '/release_key.asc') {
      res.writeHead(200, {'Content-Type': 'application/pgp-keys'});
      fs.readFile(pub).then(buf => res.end(buf)).catch(()=>res.end(''));
    } else {
      res.writeHead(404); res.end('');
    }
  });
  await new Promise((r, rej)=>{ server.once('error', rej); server.listen(0, r); });
  const port = server.address().port;

  const old = process.env.UGL_GITHUB_API_BASE;
  process.env.UGL_GITHUB_API_BASE = `http://127.0.0.1:${port}`;
  const old2 = process.env.UGL_GITHUB_API_BASE;
  process.env.UGL_GITHUB_API_BASE = `http://127.0.0.1:${port}`;
  const fetched = await pm.fetchPublicKey('github:owner/repo');
  const got = await fs.readFile(fetched, 'utf8');
  assert.equal(got, 'GH RELEASE KEY');
  process.env.UGL_GITHUB_API_BASE = old2;

  await new Promise((r)=>server.close(r));
});
