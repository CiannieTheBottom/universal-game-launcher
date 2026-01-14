import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {spawnSync} from 'child_process';
import {fileURLToPath} from 'url';
import https from 'https';
import http from 'http';
import {createWriteStream} from 'fs';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getProtonsDir() {
  return process.env.UGL_PROTONS_DIR || path.join(os.homedir(), '.local', 'share', 'ugl', 'protons');
}

export async function ensureProtonsDir() {
  const dir = getProtonsDir();
  await fs.mkdir(dir, {recursive: true});
  return dir;
}

export async function listInstalledVersions() {
  const dir = await ensureProtonsDir();
  const entries = await fs.readdir(dir, {withFileTypes: true});
  return entries.filter(e => e.isDirectory()).map(e => e.name);
}

export async function isInstalled(version) {
  const dir = path.join(getProtonsDir(), version);
  try {
    const st = await fs.stat(dir);
    return st.isDirectory();
  } catch (e) {
    return false;
  }
}

export function runTarExtract(archivePath, dest) {
  // Use system tar to extract so we support .tar.gz / .tar.xz etc.
  const res = spawnSync('tar', ['-xf', archivePath, '-C', dest, '--strip-components=1'], {stdio: 'inherit'});
  if (res.status !== 0) {
    throw new Error('tar extraction failed');
  }
}

export async function installFromArchive(archivePath, version) {
  const dir = path.join(await ensureProtonsDir(), version);
  await fs.mkdir(dir, {recursive: true});
  runTarExtract(archivePath, dir);
  // touch a marker
  await fs.writeFile(path.join(dir, '.installed-by'), `ugl ${new Date().toISOString()}`);
  return dir;
}

export async function computeSha256(filePath) {
  const h = crypto.createHash('sha256');
  const buf = await fs.readFile(filePath);
  h.update(buf);
  return h.digest('hex');
}

export async function verifyChecksum(filePath, expectedHex) {
  if (!expectedHex) return true;
  const got = await computeSha256(filePath);
  return got.toLowerCase() === expectedHex.toLowerCase();
}

export async function downloadToTemp(url, destPath, expectedSha256 = null) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    const getter = url.startsWith('https') ? https.get : http.get;
    getter(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow redirect
        downloadToTemp(res.headers.location, destPath, expectedSha256).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Request failed: ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('close', async () => {
        try {
          if (expectedSha256) {
            const ok = await verifyChecksum(destPath, expectedSha256);
            if (!ok) {
              await fs.unlink(destPath).catch(()=>{});
              console.error('downloadToTemp: checksum mismatch for', destPath);
              return reject(new Error('Checksum mismatch'));
            }
          }
          resolve(destPath);
        } catch (e) {
          await fs.unlink(destPath).catch(()=>{});
          reject(e);
        }
      });
    }).on('error', async (err) => {
      await fs.unlink(destPath).catch(()=>{});
      reject(err);
    });
  });
}

export async function installFromUrl(version, url, expectedSha256 = null) {
  const tmp = path.join(os.tmpdir(), `ugl-proton-${version}-${Date.now()}`);
  const archivePath = `${tmp}`;
  await fs.mkdir(tmp, {recursive: true});
  const downloadPath = path.join(tmp, path.basename(new URL(url).pathname));
  await downloadToTemp(url, downloadPath, expectedSha256);
  return installFromArchive(downloadPath, version);
}

export async function removeVersion(version) {
  const dir = path.join(getProtonsDir(), version);
  await fs.rm(dir, {recursive: true, force: true});
}

export async function setDefaultVersion(version) {
  const dir = getProtonsDir();
  await fs.writeFile(path.join(dir, '.default'), version);
}

export async function getDefaultVersion() {
  try {
    const dir = getProtonsDir();
    const v = await fs.readFile(path.join(dir, '.default'), 'utf8');
    return v.trim();
  } catch (e) {
    return null;
  }
}

export async function findProtonBin(version) {
  const base = path.join(getProtonsDir(), version);
  const candidates = [
    path.join(base, 'dist', 'bin', 'wine'),
    path.join(base, 'dist', 'bin', 'wine64'),
    path.join(base, 'dist', 'bin', 'proton'),
    path.join(base, 'proton'),
    path.join(base, 'bin', 'wine'),
  ];
  for (const c of candidates) {
    try {
      const st = await fs.stat(c);
      if (st.isFile()) return c;
    } catch (e) {}
  }
  return null;
}

export async function createTempGpgHome() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ugl-gnupg-'));
  // gpg requires 0700 permissions for GNUPGHOME
  await fs.chmod(tmp, 0o700);
  return tmp;
}

export function gpgAvailable() {
  try {
    const res = spawnSync('gpg', ['--version']);
    return res.status === 0;
  } catch (e) {
    return false;
  }
}

export async function importPublicKey(pubkeyPath, gnupghome) {
  const res = spawnSync('gpg', ['--batch', '--yes', '--homedir', gnupghome, '--import', pubkeyPath], {stdio: 'pipe'});
  if (res.status !== 0) {
    throw new Error(`gpg import failed: ${res.stderr.toString()}`);
  }
}

export async function verifyDetachedSignature(sigPath, filePath, pubkeyPath) {
  if (!gpgAvailable()) throw new Error('gpg not available');
  const gnupghome = await createTempGpgHome();
  try {
    await importPublicKey(pubkeyPath, gnupghome);
    const res = spawnSync('gpg', ['--batch', '--homedir', gnupghome, '--verify', sigPath, filePath], {stdio: 'pipe'});
    if (res.status !== 0) {
      throw new Error(`gpg verify failed: ${res.stderr.toString() || res.stdout.toString()}`);
    }
    return true;
  } finally {
    // cleanup
    await fs.rm(gnupghome, {recursive: true, force: true});
  }
}

export async function fetchPublicKey(source) {
  // Returns a local file path to the public key (downloads into a temp dir)
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ugl-pubkey-'));
  const dst = path.join(tmp, 'pubkey.asc');

  // raw URL
  if (/^https?:\/\//.test(source)) {
    await downloadToTemp(source, dst);
    return dst;
  }

  // github shorthand: github:owner/repo or github:owner/repo@tag
  if (source.startsWith('github:')) {
    const payload = source.slice('github:'.length);
    let ownerRepo, tag;
    if (payload.includes('@')) {
      [ownerRepo, tag] = payload.split('@');
    } else {
      ownerRepo = payload;
      tag = null;
    }
    const [owner, repo] = ownerRepo.split('/');
    if (!owner || !repo) throw new Error('Invalid github: source format, expected github:owner/repo[@tag]');

    const apiBase = process.env.UGL_GITHUB_API_BASE || 'https://api.github.com';
    const releaseUrl = tag ? `${apiBase}/repos/${owner}/${repo}/releases/tags/${tag}` : `${apiBase}/repos/${owner}/${repo}/releases/latest`;
    const userAgent = 'ugl-proton/1.0';
    const body = await new Promise((resolve, reject) => {
      const getter = releaseUrl.startsWith('https') ? https.get : http.get;
      getter(releaseUrl, {headers: {'User-Agent': userAgent}}, (res) => {
        let data = '';
        res.on('data', (c) => data += c.toString());
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data));
          else reject(new Error(`GitHub API request failed: ${res.statusCode} ${data}`));
        });
      }).on('error', reject);
    });
    const assets = body.assets || [];
    const candidate = assets.find(a => /\.asc$|\.sig$|pub|public/i.test(a.name));
    if (!candidate) throw new Error('No suitable public key asset found in release');
    const url = candidate.browser_download_url;
    await downloadToTemp(url, dst);
    return dst;
  }

  // gpg:keyid or keyserver:keyid -> use gpg to fetch
  if (source.startsWith('gpg:') || source.startsWith('keyserver:')) {
    if (!gpgAvailable()) throw new Error('gpg not available');
    const keyId = source.split(':')[1];
    if (!keyId) throw new Error('Invalid gpg:keyid format');
    const gnupghome = await createTempGpgHome();
    try {
      const res = spawnSync('gpg', ['--batch', '--homedir', gnupghome, '--keyserver', 'hkps://keys.openpgp.org', '--recv-keys', keyId], {stdio: 'pipe'});
      if (res.status !== 0) throw new Error(`gpg recv-keys failed: ${res.stderr.toString() || res.stdout.toString()}`);
      const exp = spawnSync('gpg', ['--homedir', gnupghome, '--armor','--export', keyId], {encoding: 'utf8'});
      if (exp.status !== 0) throw new Error('gpg export failed: ' + exp.stderr);
      await fs.writeFile(dst, exp.stdout, 'utf8');
      return dst;
    } finally {
      await fs.rm(gnupghome, {recursive: true, force: true});
    }
  }

  // fallback: assume local path
  if (await (async ()=>{ try{ await fs.stat(source); return true;} catch(e){return false;} })()) {
    await fs.copyFile(source, dst);
    return dst;
  }

  throw new Error('Unsupported public key source format');
}

export async function verifyGpgSignature(filePath, sigUrlOrPath, pubkeyUrlOrPath) {
  if (!sigUrlOrPath || !pubkeyUrlOrPath) throw new Error('Both signature and public key paths/URLs are required');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ugl-gpg-'));
  try {
    const sigDst = path.join(tmp, 'sig');
    // handle signature
    if (/^https?:\/\//.test(sigUrlOrPath)) {
      await downloadToTemp(sigUrlOrPath, sigDst);
    } else {
      await fs.copyFile(sigUrlOrPath, sigDst);
    }

    // handle pubkey via fetchPublicKey helper for various shorthands
    let keyDst;
    if (/^https?:\/\//.test(pubkeyUrlOrPath) || /^github:/.test(pubkeyUrlOrPath) || /^gpg:/.test(pubkeyUrlOrPath) || /^keyserver:/.test(pubkeyUrlOrPath)) {
      keyDst = await fetchPublicKey(pubkeyUrlOrPath);
    } else {
      keyDst = path.join(tmp, 'pubkey.asc');
      await fs.copyFile(pubkeyUrlOrPath, keyDst);
    }
    return await verifyDetachedSignature(sigDst, filePath, keyDst);
  } finally {
    await fs.rm(tmp, {recursive: true, force: true});
  }
}

export default {
  getProtonsDir,
  ensureProtonsDir,
  listInstalledVersions,
  isInstalled,
  installFromArchive,
  installFromUrl,
  downloadToTemp,
  computeSha256,
  verifyChecksum,
  removeVersion,
  setDefaultVersion,
  getDefaultVersion,
  findProtonBin
};
