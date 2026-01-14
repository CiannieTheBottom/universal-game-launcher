import express from 'express';
import * as pm from '../protonManager/index.js';

export function createApp(manager = pm) {
  const app = express();
  app.use(express.json());

  app.get('/api/protons', async (req, res) => {
    try {
      const versions = await manager.listInstalledVersions();
      const def = await manager.getDefaultVersion();
      res.json({ versions, default: def });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/protons/install', async (req, res) => {
    try {
      const { version, url, sha256 } = req.body || {};
      if (!version || !url) return res.status(400).json({ error: 'version and url required' });
      await manager.installFromUrl(version, url, sha256 ?? null);
      res.status(201).json({ version });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/protons/:version', async (req, res) => {
    try {
      const { version } = req.params;
      await manager.removeVersion(version);
      res.json({ removed: version });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/protons/:version/set-default', async (req, res) => {
    try {
      const { version } = req.params;
      await manager.setDefaultVersion(version);
      res.json({ default: version });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

// If run directly, start server
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = process.env.PORT || 3000;
  const app = createApp();
  app.listen(port, () => console.log(`Proton API listening on ${port}`));
}
