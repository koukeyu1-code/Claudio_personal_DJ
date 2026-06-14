import { Router } from 'express';
import { Readable } from 'node:stream';
import { handleMessage } from '../services/chat-engine.js';

const router = Router();

// Proxy NCM audio so it's same-origin — lets the browser's Web Audio
// AnalyserNode read the real spectrum (cross-origin streams are silenced).
// Forwards Range so seeking still works.
router.get('/audio', async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//.test(url)) return res.status(400).end();
  try {
    const headers = { 'User-Agent': 'Claudio/0.0.1' };
    if (req.headers.range) headers.Range = req.headers.range;
    const upstream = await fetch(url, { headers });
    res.status(upstream.status);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error('[audio proxy]', err.message);
    res.status(502).end();
  }
});

router.get('/lyric', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const NCM = process.env.NCM_API_URL || 'http://localhost:3000';
    const r = await fetch(`${NCM}/lyric?id=${encodeURIComponent(id)}`);
    const data = await r.json();
    res.json({ lrc: data?.lrc?.lyric ?? '' });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.post('/chat', async (req, res) => {
  const message = (req.body?.message ?? '').toString().trim();
  if (!message) return res.status(400).json({ error: 'message required' });

  try {
    const out = await handleMessage(message);
    res.json(out);
  } catch (err) {
    console.error('[chat]', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

export default router;
