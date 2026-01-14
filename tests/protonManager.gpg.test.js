import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'child_process';
import * as pm from '../src/protonManager/index.js';

function gpgExists() {
  try {
    const res = spawnSync('gpg', ['--version']);
    return res.status === 0;
  } catch (e) {
    return false;
  }
}

if (!gpgExists()) {
  test('gpg not available -> skip GPG tests', (t) => { t.skip(); });
} else {
  test('gpg verify detached signature succeeds', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ugl-gpg-test-'));
    const keyHome = path.join(tmp, 'keyhome');
    await fs.mkdir(keyHome, {recursive: true});

    // generate a temporary key
    const keyParams = `%echo Generating a test key
Key-Type: RSA
Key-Length: 1024
Name-Real: Test User
Name-Email: test@example.com
Expire-Date: 0
%no-protection
%commit
%echo done
`;
    const gen = spawnSync('gpg', ['--batch', '--homedir', keyHome, '--gen-key'], {input: keyParams});
    if (gen.status !== 0) throw new Error('gpg key generation failed: ' + gen.stderr.toString());

    // export public key
    const pubkey = spawnSync('gpg', ['--homedir', keyHome, '--export', '--armor', 'test@example.com'], {encoding: 'utf8'});
    if (pubkey.status !== 0) throw new Error('gpg export failed: ' + pubkey.stderr.toString());
    const pubkeyPath = path.join(tmp, 'pubkey.asc');
    await fs.writeFile(pubkeyPath, pubkey.stdout, 'utf8');

    // create file and detached signature
    const filePath = path.join(tmp, 'file.txt');
    await fs.writeFile(filePath, 'signed content');
    const sigPath = path.join(tmp, 'file.sig');
    const sign = spawnSync('gpg', ['--homedir', keyHome, '--batch', '--yes', '--output', sigPath, '--detach-sign', filePath]);
    if (sign.status !== 0) throw new Error('gpg sign failed: ' + sign.stderr.toString());

    // now verify using our function
    const ok = await pm.verifyGpgSignature(filePath, sigPath, pubkeyPath);
    assert.equal(ok, true);

    // tamper file -> verify should fail
    await fs.writeFile(filePath, 'tampered');
    let failed = false;
    try {
      await pm.verifyGpgSignature(filePath, sigPath, pubkeyPath);
    } catch (e) {
      failed = true;
    }
    assert(failed, 'expected verification to fail for tampered file');

    await fs.rm(tmp, {recursive: true, force: true});
  });
}
