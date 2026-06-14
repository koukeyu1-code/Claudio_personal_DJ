import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PERSONA_PATH = resolve('./prompts/dj-persona.md');
const TASTE_PATH = resolve('./prompts/user-music-taste.md');
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_ENDPOINT = process.env.DEEPSEEK_ENDPOINT || 'https://api.deepseek.com';
export const LISTENER = process.env.LISTENER_NAME || '听众';

let systemCache = null;
async function loadSystemPrompt() {
  if (systemCache) return systemCache;
  const persona = (await readFile(PERSONA_PATH, 'utf8')).replaceAll('{{LISTENER}}', LISTENER);
  // taste profile is personal & gitignored — tolerate its absence on a fresh clone
  const taste = await readFile(TASTE_PATH, 'utf8').catch(() => '');
  systemCache = taste.trim() ? `${persona.trim()}\n\n---\n\n${taste.trim()}` : persona.trim();
  return systemCache;
}

// Fold history into a context block inside the user message instead of real
// assistant turns: plain-text assistant turns make json_object mode emit blank
// content, and JSON-wrapped ones get imitated verbatim (dropping play/reason)
// Intent comes from the UI channel, not the model's guess: 'chat' = typed +
// Enter (default: don't touch music), 'switch' = 🎲 / continue (force 3 songs)
function intentDirective(intent) {
  if (intent === 'switch') {
    return '【硬性要求】本条是“换一批歌”指令，play 必须正好 2 首歌。';
  }
  return '【硬性要求·优先级高于历史】本条是聊天频道消息，play 默认必须为 []。' +
    '只有当这条新消息本身明确点歌或要求换歌时（出现“来点/换/想听/放首/切歌/再来一批”等明确诉求）才给 2 首歌。' +
    '提问（如“德雷珀是谁”“现在几点”“你喜欢什么”）、闲聊、对正在播放歌曲的评价、情绪倾诉，全部属于聊天，play 一律为 []，只用语言回应，绝不附歌。' +
    '即使对话记录里你以前对类似消息推过歌，本条也不要照抄那种行为。';
}

function buildMessages(history, userMessage, intent) {
  const head = history.length
    ? `【最近的对话记录，仅作上下文参考】\n${history
        .map(m => `${m.role === 'user' ? '听众' : 'DJ'}: ${m.content}`)
        .join('\n')}\n\n`
    : '';
  // Directive goes LAST (after the new message) for maximum recency weight
  return [{
    role: 'user',
    content: `${head}【听众的新消息】\n${userMessage}\n\n${intentDirective(intent)}\n\n请按输出契约返回完整 JSON。`,
  }];
}

function extractJson(text) {
  // strip markdown code fences if present
  const src = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '');
  // find outermost { } by depth tracking
  let depth = 0, start = -1, end = -1;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') { if (depth++ === 0) start = i; }
    else if (src[i] === '}') { if (--depth === 0) { end = i; break; } }
  }
  if (start === -1 || end === -1) throw new Error(`no JSON object in: ${text.slice(0, 200)}`);
  return JSON.parse(src.slice(start, end + 1));
}

// Per-request context appended to the (cached) system prompt: current time,
// weather, the listener's routines, and play history so the DJ matches the
// moment and avoids repeats
function dynamicContext({ recentPlays = [], weeklyTop = [], unplayable = [], candidates = [], weather = null, routines = null, schedule = null, tasks = [], dayRest = null } = {}) {
  const now = new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  const pad = n => String(n).padStart(2, '0');
  let ctx = `【当前时间】${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} 星期${week} ${pad(now.getHours())}:${pad(now.getMinutes())}。串场语气和选歌要贴合此刻的时段氛围（清晨/白天/傍晚/深夜）。`;
  if (typeof dayRest === 'boolean') {
    const h = now.getHours();
    const slot = h < 7 ? '深夜' : h < 11 ? '清晨' : h < 14 ? '午间' : h < 18 ? '午后' : h < 22 ? '傍晚' : '深夜';
    const mood = {
      深夜: '低声、温柔、慢一点，像深夜电台陪着听众',
      清晨: '轻快明亮，把听众精神地唤醒',
      午间: '轻松随意、简短',
      午后: '慵懒放松、不紧不慢',
      傍晚: '松弛下来，像下班路上的陪伴',
    }[slot];
    const base = dayRest ? '今天是休息日，整体更松弛、随性、带点玩乐感' : '今天是工作日，整体利落、有节奏';
    ctx += `\n\n【此刻的电台基调】${base}；${slot}时段——${mood}。串场词的口吻要贴合这个基调,每段都自然体现出来,不要生硬地报"现在是XX时段"。`;
  }
  if (weather) {
    ctx += `\n\n【当前天气】${weather}。可以自然地聊到，不要每次都提。`;
  }
  if (routines) {
    ctx += `\n\n【听众的日常作息（长期习惯）】\n${routines}`;
  }
  if (schedule) {
    ctx += `\n\n【听众未来一周的真实日程（来自飞书日历，已按时间排序）】\n${schedule}\n` +
      `这份列表是当前最新的真实数据，**以它为准，不要受对话记录里你之前任何关于日程的说法影响**（之前可能因为读取失败说过"看不到/没有会议"，现在以这份为准）。回答日程/会议问题时**只能依据上面这份列表**：「下一个会议」就是列表里第一个不带"（已结束）"标记的日程；列表里没有的会议、时间、名称、内容一律不存在，要说「日历上没看到」。**严禁编造**会议的时间、名称、时长、内容或任何细节。**括号里的"还有约X"是系统精确算好的剩余时间，要提"还有多久"就直接用它，绝对不要自己心算时间差**。平时可以自然地据此挑歌（会议前来点提神的、忙完给点放松的），别像念清单一样全报出来。`;
  } else {
    ctx += `\n\n【日程】你当前看不到听众的日历。如果听众问起会议/日程，必须如实说你暂时看不到他的日历，**绝对不要编造任何会议的时间、名称或内容**。`;
  }
  if (tasks.length) {
    ctx += `\n\n【听众的飞书待办任务（未完成，可读可改）】只能依据这份列表，列表外的任务一律说"没看到"，**严禁编造**：\n${
      tasks.map(t => `《${t.summary}》${t.dueLabel || ''}`).join('\n')}\n` +
      `你可以读这些待办来聊天、据此挑歌（deadline 前提神、忙完放松）。**括号里的"还有约X"是系统算好的，直接用，别自己心算时间差**。\n` +
      `**改任务要走确认流程**：听众说某事做完了、或要改某个任务时，你**先在 say 里复述确认**（如"确认把《写周报》标记完成吗？"），taskAction 保持 null；只有当听众在对话里**明确回复确认**后，下一轮才在 taskAction 输出操作。绝不在未确认时擅自改动。`;
  }
  if (candidates.length) {
    ctx += `\n\n【候选曲库 ★推歌时必须从这里选★】下面这些都是听众${LISTENER}真实歌单里、最近没在电台放过的歌。需要推歌时,**只从这个列表里挑** 2 首,按当下时段/心情/天气选最贴合的,并保持风格起伏——不要凭记忆推列表以外的歌:\n${
      candidates.map(c => `《${c.title}》- ${c.artist ?? ''}`).join('\n')}`;
  }
  if (weeklyTop.length) {
    ctx += `\n\n【听众本周在电台听得最多】只作为近期口味风向的参考，照着这个感觉找**相似但不同**的歌，列表里的歌本身不要再推：\n${
      weeklyTop.map(t => `《${t.title}》- ${t.artist ?? ''}（${t.n} 次）`).join('\n')}`;
  }
  if (recentPlays.length) {
    ctx += `\n\n【最近播过的歌，绝对不要再推荐这些】除非听众点名重听，否则一首都不能重复。你的口味画像里那些大热曲目大多已经在这个列表里了——别再回头推它们，要主动往外探索：同类风格里听众**可能还没听过**的新歌、冷门歌、同一乐队的其他作品、相似艺人的代表作。宁可推得新鲜一点，也不要重复：\n${
      recentPlays.map(p => `《${p.title}》- ${p.artist ?? ''}`).join('\n')}`;
  }
  if (unplayable.length) {
    ctx += `\n\n【这些歌在本电台因版权无法播放，绝对不要再推荐】\n${
      unplayable.map(p => `《${p.title}》- ${p.artist ?? ''}`).join('\n')}`;
  }
  return ctx;
}

export async function ask({ userMessage, history = [], context = {}, intent = 'chat' }) {
  const systemPrompt = `${await loadSystemPrompt()}\n\n---\n\n${dynamicContext(context)}`;
  const messages = buildMessages(history, userMessage, intent);

  let text = '';
  let data = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const body = {
      model: 'deepseek-v4-flash',
      // V4 defaults to thinking mode (reasoning_content + content can come
      // back blank with json_object); we only need fast JSON output
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 16000,
      temperature: 0.7,
    };
    // json_object mode occasionally returns blank content (documented DeepSeek
    // quirk); on retry fall back to plain text and let extractJson parse it
    if (attempt === 1) body.response_format = { type: 'json_object' };

    const response = await fetch(`${DEEPSEEK_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error ${response.status}: ${error}`);
    }

    data = await response.json();
    text = data.choices?.[0]?.message?.content ?? '';
    if (text.trim()) break;
    console.warn(`[llm] empty content, attempt ${attempt}/2`);
  }

  if (!text.trim()) {
    throw new Error(`empty AI response: ${JSON.stringify(data).slice(0, 300)}`);
  }

  let dj;
  try {
    dj = extractJson(text);
  } catch (parseErr) {
    console.error('[llm] raw text:', text.slice(0, 500));
    throw parseErr;
  }

  // taskAction: only honored when it's a well-formed {op, task}; the persona
  // only emits it AFTER the listener confirmed, so the backend executes it as-is
  let taskAction = null;
  const ta = dj.taskAction;
  if (ta && typeof ta === 'object' && ['complete', 'reopen', 'update'].includes(ta.op) && ta.task) {
    taskAction = { op: ta.op, task: String(ta.task), summary: ta.summary ? String(ta.summary) : undefined };
  }

  const out = {
    episode: String(dj.episode ?? ''),
    say: String(dj.say ?? ''),
    sayZh: String(dj.sayZh ?? ''),
    play: Array.isArray(dj.play) ? dj.play : [],
    reason: String(dj.reason ?? ''),
    segue: String(dj.segue ?? ''),
    taskAction,
  };

  // Deterministic guard for the language rule: history momentum sometimes makes
  // the model announce Chinese songs in a foreign language — if so, the sayZh
  // translation IS the correct Chinese script, use it as the say
  const mainlyChinese = text => {
    const t = text.replace(/《[^》]*》/g, ''); // song titles don't count
    return (t.match(/[一-鿿]/g) || []).length >= (t.match(/[a-zA-Z]/g) || []).length;
  };
  const songsAreChinese = out.play.length > 0 &&
    out.play.every(p => /[一-鿿]/.test(`${p.title}${p.artist ?? ''}`));
  if (songsAreChinese && out.say && !mainlyChinese(out.say) && mainlyChinese(out.sayZh)) {
    console.warn('[llm] language rule violated (Chinese songs, foreign say) — using sayZh');
    out.say = out.sayZh;
    out.sayZh = '';
  }

  return out;
}
