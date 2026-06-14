import { handleMessage } from './chat-engine.js';

// Scheduled shows — fires only when at least one client is connected.
// Time/weather/routines context is injected automatically by llm.js.
const SLOTS = [
  {
    time: '08:30',
    name: '早安电台',
    prompt: '（定时节目「早安电台」开播了：向听众道早安，结合当前时间、天气和他的作息聊两句今天，然后推荐 2 首适合清晨慢慢打开状态的歌。）',
  },
  {
    time: '18:30',
    name: '傍晚电台',
    prompt: '（定时节目「傍晚电台」开播了：一天告一段落，陪听众松弛下来，聊两句，推荐 2 首适合傍晚的歌。）',
  },
  {
    time: '22:30',
    name: '晚安电台',
    prompt: '（定时节目「晚安电台」开播了：夜深了，用安静温柔的方式收尾今天，推荐 2 首安静的歌，最后道晚安。）',
  },
];

export function startScheduler({ broadcast, hasClients }) {
  let lastFired = '';
  setInterval(async () => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const slot = SLOTS.find(s => s.time === hhmm);
    if (!slot) return;
    const key = `${now.toDateString()}|${hhmm}`;
    if (lastFired === key) return;
    lastFired = key;
    if (!hasClients()) return; // nobody listening, stay quiet
    console.log(`[scheduler] ${slot.name} on air`);
    try {
      broadcast({ type: 'thinking' });
      const out = await handleMessage(slot.prompt);
      broadcast({ type: 'chat', ...out });
    } catch (err) {
      console.error('[scheduler]', err);
    }
  }, 20_000);
}
