import { Router } from 'express';
import { authorizeUrl, exchangeCode, isConfigured, isConnected } from '../services/feishu.js';

const router = Router();

const page = (title, body) =>
  `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui,sans-serif;background:#0a0a0c;color:#e8e8e8;text-align:center;padding-top:80px;line-height:1.7">
   <h2>${title}</h2>${body}<p><a href="/" style="color:#79f2c0">返回 Claudio</a></p></body>`;

router.get('/login', (_req, res) => {
  if (!isConfigured()) return res.status(500).send(page('飞书未配置', '<p>缺少 FEISHU_APP_ID / FEISHU_APP_SECRET。</p>'));
  res.redirect(authorizeUrl());
});

router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error) return res.send(page('授权失败', `<p>${error_description || error}</p>`));
  if (!code) return res.status(400).send(page('缺少 code', '<p>没有收到授权码。</p>'));
  try {
    await exchangeCode(String(code));
    res.send(page('✅ 飞书日历已连接', '<p>Claudio 现在能看到你今天的日程了。</p>'));
  } catch (err) {
    res.status(500).send(page('换取 token 失败', `<p>${err.message}</p>`));
  }
});

router.get('/status', async (_req, res) => {
  res.json({ configured: isConfigured(), connected: await isConnected() });
});

export default router;
