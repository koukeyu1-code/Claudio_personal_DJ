import './services/tz.js'; // must be first: locks the timezone before anything formats time
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { resolve } from 'node:path';
import chat from './routes/chat.js';
import login from './routes/login.js';
import feishu from './routes/feishu.js';
import { handleMessage } from './services/chat-engine.js';
import { startScheduler } from './services/scheduler.js';
import { setLocation } from './services/weather.js';

const app = express();
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'claudio', version: '0.0.1' }));
app.use('/api', chat);
app.use('/api/login', login);
app.use('/api/feishu', feishu);

app.get('/login', (_req, res) => res.sendFile(resolve('./web/login.html')));
app.use('/tts', express.static(resolve('./data/tts'), { maxAge: '7d', immutable: true }));
// always revalidate the app shell so a phone refresh picks up the latest build
app.use(express.static(resolve('./web'), {
  setHeaders: (res, p) => {
    if (/\.(html|js|css|webmanifest)$/.test(p)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

const httpServer = createServer(app);

const wss = new WebSocketServer({ server: httpServer, path: '/api/stream' });
wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'hello', name: 'claudio', listener: process.env.LISTENER_NAME || '听众' }));

  ws.on('message', async raw => {
    let payload;
    try { payload = JSON.parse(raw.toString('utf8')); }
    catch { return ws.send(JSON.stringify({ type: 'error', message: 'invalid json' })); }

    if (payload.type === 'location') {
      // Browser-reported device position — overrides IP geolocation for weather
      setLocation(Number(payload.lat), Number(payload.lon)).catch(() => {});
      return;
    }

    let content, intent;
    if (payload.type === 'message' && typeof payload.content === 'string') {
      content = payload.content.trim();
      // Intent is decided by the UI channel, not the model: 🎲/retry send
      // 'switch', the chat box sends 'chat' (default). Never trust the model
      // to guess whether a typed line was a song request.
      intent = payload.intent === 'switch' ? 'switch' : 'chat';
    } else if (payload.type === 'continue') {
      // Radio mode: the queue ran dry, ask the DJ for the next segment
      content = '（系统：这一轮歌播完了。请像电台一样自然衔接你上次的 segue，直接开始下一段串场并推荐 2 首歌，不要等听众回应，也不要重复最近播过的曲目。）';
      intent = 'switch';
    } else {
      return ws.send(JSON.stringify({ type: 'error', message: 'expected {type:"message",content} or {type:"continue"}' }));
    }

    ws.send(JSON.stringify({ type: 'thinking' }));
    try {
      const out = await handleMessage(content, intent);
      ws.send(JSON.stringify({ type: 'chat', ...out }));
    } catch (err) {
      console.error('[ws]', err);
      ws.send(JSON.stringify({ type: 'error', message: String(err.message || err) }));
    }
  });
});

startScheduler({
  broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const c of wss.clients) if (c.readyState === 1) c.send(s);
  },
  hasClients: () => [...wss.clients].some(c => c.readyState === 1),
});

const PORT = Number(process.env.PORT) || 8080;
httpServer.listen(PORT, () => {
  console.log(`Claudio backend on http://localhost:${PORT}  (WS: /api/stream)`);
});
