import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {spawnSync} from 'child_process';
import http from 'http';

import * as pm from '../src/protonManager/index.js';

async function mkPayloadWithProton(tmpDir) {
  const payload = path.join(tmpDir, 'payload');
  await fs.mkdir(path.join(payload, 'dist', 'bin'), {recursive: true});
  const bin = path.join(payload, 'dist', 'bin', 'proton');
  await fs.writeFile(bin, '#!/bin/sh\necho proton', {mode: 0o755});
  return payload;
}

function createTarArchive(srcDir, archivePath) {
  // Create a gzipped tar of the contents of srcDir
  const res = spawnSync('tar', ['-C', srcDir, '-czf', archivePath, '.']);
  if (res.status !== 0) throw new Error('tar failed: ' + res.stderr?.toString());
}

function listenFile(filePath) {
  const server = http.createServer((req, res) => {
    if (req.url === '/file.tar.gz') {
      res.writeHead(200, {'content-type': 'application/gzip'});
      const rs = require('fs').createReadStream(filePath);
      rs.pipe(res);
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

test('integration: installFromArchive extracts and registers version', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ugl-integ-'));
  process.env.UGL_PROTONS_DIR = path.join(tmp, 'protons');
  const payload = await mkPayloadWithProton(tmp);
  const archive = path.join(tmp, 'archive.tar.gz');
  createTarArchive(payload, archive);

  const version = 'integ-archive-1';
  const dir = await pm.installFromArchive(archive, version);
  assert.ok(await pm.isInstalled(version), 'version should be installed');
  const bin = await pm.findProtonBin(version);
  assert.ok(bin && bin.includes('dist'), 'proton binary should be found inside dist');

  // cleanup
  await pm.removeVersion(version);
  const installed = await pm.listInstalledVersions();
  assert.ok(!installed.includes(version));
});

test('integration: installFromUrl works with correct sha256 and fails on bad sha', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ugl-integ-'));
  process.env.UGL_PROTONS_DIR = path.join(tmp, 'protons');
  const payload = await mkPayloadWithProton(tmp);
  const archive = path.join(tmp, 'archive2.tar.gz');
  createTarArchive(payload, archive);

  const goodSha = await pm.computeSha256(archive);
  const badSha = '0000000000000000000000000000000000000000000000000000000000000000';

  // use file:// URL to avoid flaky local HTTP server in this environment
  const url = `file://${archive}`;

  // good sha should succeed
  const v1 = 'integ-url-1';
  await pm.installFromUrl(v1, url, goodSha);
  assert.ok(await pm.isInstalled(v1));
  await pm.removeVersion(v1);

  // bad sha should reject
  const v2 = 'integ-url-2';
  let threw = false;
  try {
    await pm.installFromUrl(v2, url, badSha);
  } catch (e) {
    threw = true;
  }
  assert.ok(threw, 'installFromUrl should throw on bad checksum');
});
