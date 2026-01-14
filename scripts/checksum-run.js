import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as pm from '../src/protonManager/index.js';
import http from 'http';

(async ()=>{
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ugl-run-'));
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
  console.log('goodHash', goodHash);
  console.log('Attempting good download...');
  await pm.downloadToTemp(url, tmpDownload, goodHash);
  console.log('Downloaded good file OK');

  const tmpDownload2 = path.join(tmp, 'down2.bin');
  console.log('Attempting bad download...');
  try {
    await pm.downloadToTemp(url, tmpDownload2, 'deadbeef');
    console.log('Bad download unexpectedly succeeded');
  } catch (e) {
    console.log('Bad download rejected as expected:', e.message);
  }
  await new Promise((r)=>server.close(r));
})();
