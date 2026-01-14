import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as pm from '../src/protonManager/index.js';
import {spawnSync} from 'child_process';

function mkTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ugl-test-'));
}

test('installFromArchive and findProtonBin + list/set-default/remove', async (t) => {
  const tmp = await mkTempDir();
  process.env.UGL_PROTONS_DIR = path.join(tmp, 'protons');

  // create a fake proton archive
  const sampleDir = path.join(tmp, 'sample');
  await fs.mkdir(path.join(sampleDir, 'dist', 'bin'), {recursive: true});
  const winePath = path.join(sampleDir, 'dist', 'bin', 'wine');
  await fs.writeFile(winePath, '#!/bin/sh\necho wine');
  await fs.chmod(winePath, 0o755);

  const archivePath = path.join(tmp, 'sample.tar.gz');
  const cwd = tmp;
  // create archive using system tar
  const res = spawnSync('tar', ['-czf', archivePath, '-C', sampleDir, '.']);
  assert.equal(res.status, 0, 'creating tar failed');

  // install
  await pm.installFromArchive(archivePath, 'proton-ge-test-1');
  const list = await pm.listInstalledVersions();
  assert(list.includes('proton-ge-test-1'));

  const bin = await pm.findProtonBin('proton-ge-test-1');
  assert(bin && bin.endsWith('dist/bin/wine'));

  await pm.setDefaultVersion('proton-ge-test-1');
  const def = await pm.getDefaultVersion();
  assert.equal(def, 'proton-ge-test-1');

  await pm.removeVersion('proton-ge-test-1');
  const list2 = await pm.listInstalledVersions();
  assert(!list2.includes('proton-ge-test-1'));
});
