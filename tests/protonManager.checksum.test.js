import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as pm from '../src/protonManager/index.js';
import http from 'http';

test('computeSha256 works on small file', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ugl-test-'));
  const p = path.join(tmp, 'hello.txt');
  await fs.writeFile(p, 'hello');
  const hash = await pm.computeSha256(p);
  // sha256 of 'hello' is known
  assert.equal(hash, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});

test('downloadToTemp verifies checksum and rejects on mismatch', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ugl-test-'));
  const p = path.join(tmp, 'file.txt');
  const content = 'checksum test!';
  await fs.writeFile(p, content);
  const port = 30000 + Math.floor(Math.random()*10000);
  const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'application/octet-stream'});
    fs.readFile(p).then(buf => res.end(buf)).catch(()=>res.end(''));
  });
  await new Promise((r)=>server.listen(port, r));
  const url = `http://127.0.0.1:${port}/file.txt`;
  const tmpDownload = path.join(tmp, 'down.bin');
  const goodHash = await pm.computeSha256(p);

  // should succeed with correct hash
  await pm.downloadToTemp(url, tmpDownload, goodHash);
  const got = await fs.readFile(tmpDownload, 'utf8');
  assert.equal(got, content);

  // now try with bad hash and expect rejection
  const tmpDownload2 = path.join(tmp, 'down2.bin');
  let rejected = false;
  try {
    await pm.downloadToTemp(url, tmpDownload2, 'deadbeef');
  } catch (e) {
    rejected = true;
  }
  assert(rejected, 'expected download to be rejected on checksum mismatch');

  await new Promise((r)=>server.close(r));
});
