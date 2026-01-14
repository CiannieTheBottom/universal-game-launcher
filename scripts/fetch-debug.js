import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import * as pm from '../src/protonManager/index.js';

(async ()=>{
  const tmp = await fs.mkdtemp(path.join(process.cwd(), 'tmp-'));
  const pub = path.join(tmp, 'release_key.asc');
  await fs.writeFile(pub, 'GH RELEASE KEY');

  const server = http.createServer((req, res) => {
    if (req.url === '/repos/owner/repo/releases/latest') {
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
  console.log('server running on port', port);
  process.env.UGL_GITHUB_API_BASE = `http://127.0.0.1:${port}`;

  try {
    console.log('Calling fetchPublicKey github:owner/repo');
    const fetched = await pm.fetchPublicKey('github:owner/repo');
    const got = await fs.readFile(fetched, 'utf8');
    console.log('Fetched content:', got);
  } catch (e) {
    console.error('Error calling fetchPublicKey:', e && e.stack ? e.stack : e);
  } finally {
    server.close();
  }
})();
