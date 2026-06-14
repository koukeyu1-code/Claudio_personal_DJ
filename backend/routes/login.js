import { Router } from 'express';
import { setCookie } from '../services/ncm.js';

const router = Router();
const NCM = process.env.NCM_API_URL || 'http://localhost:3000';

async function ncm(path) {
  const res = await fetch(`${NCM}${path}`);
  return res.json();
}

router.get('/qr/start', async (_req, res) => {
  try {
    const { data: { unikey } } = await ncm('/login/qr/key?timestamp=' + Date.now());
    const { data: { qrimg } } = await ncm(`/login/qr/create?key=${unikey}&qrimg=true&timestamp=${Date.now()}`);
    res.json({ key: unikey, qrimg });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.get('/qr/check', async (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'key required' });
  try {
    const data = await ncm(`/login/qr/check?key=${encodeURIComponent(key)}&timestamp=${Date.now()}`);
    // 803 = success
    if (data.code === 803 && data.cookie) {
      setCookie(data.cookie);
      return res.json({ code: 803 });
    }
    res.json({ code: data.code, message: data.message });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

export default router;
