// Feishu (Lark) calendar integration via OAuth 2.0 user_access_token.
// One-time browser auth at /api/feishu/login; tokens persisted + auto-refreshed.

import { readFile, writeFile } from 'node:fs/promises';

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const REDIRECT_URI = process.env.FEISHU_REDIRECT_URI || 'http://localhost:8080/api/feishu/callback';
// offline_access is REQUIRED to receive a refresh_token; the calendar scope must
// also be added to the app in the Feishu console (权限管理) and the app published.
// Task v2 needs the GRANULAR scopes (the legacy "task:task" does NOT authorize
// v2 endpoints — error 99991679). task:task:read = read, task:task:write = write.
// calendar is read-only. All must be added in the console (权限管理) and published.
const SCOPE = process.env.FEISHU_SCOPE
  || 'offline_access calendar:calendar:readonly task:task:read task:task:write';
const TOKEN_FILE = './data/feishu-token.json';

const AUTHORIZE_URL = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
const TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token';
const API = 'https://open.feishu.cn/open-apis';

let tokens = null; // { access_token, refresh_token, access_expires_at, refresh_expires_at }

export function isConfigured() { return !!(APP_ID && APP_SECRET); }

async function loadTokens() {
  if (tokens) return tokens;
  try { tokens = JSON.parse(await readFile(TOKEN_FILE, 'utf8')); } catch { tokens = null; }
  return tokens;
}

async function saveTokens(t) {
  tokens = t;
  await writeFile(TOKEN_FILE, JSON.stringify(t, null, 2), 'utf8').catch(() => {});
}

// expires_in / refresh_token_expires_in are seconds; renew 60s early
function stamp(d, prev = null) {
  const now = Date.now();
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token ?? prev?.refresh_token,
    access_expires_at: now + (d.expires_in - 60) * 1000,
    refresh_expires_at: d.refresh_token_expires_in
      ? now + (d.refresh_token_expires_in - 60) * 1000
      : prev?.refresh_expires_at ?? now + 25 * 86_400_000,
  };
}

export function authorizeUrl(state = 'claudio') {
  const p = new URLSearchParams({ client_id: APP_ID, redirect_uri: REDIRECT_URI, response_type: 'code', state });
  if (SCOPE) p.set('scope', SCOPE);
  return `${AUTHORIZE_URL}?${p}`;
}

export async function exchangeCode(code) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: APP_ID, client_secret: APP_SECRET,
      code, redirect_uri: REDIRECT_URI,
    }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error(d.error_description || d.error || d.msg || JSON.stringify(d));
  await saveTokens(stamp(d));
}

let refreshing = null; // in-flight refresh, shared so concurrent callers don't
                       // double-spend the rotating refresh_token

async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const t = await loadTokens();
    if (!t?.refresh_token || Date.now() > t.refresh_expires_at) return null; // needs re-auth
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: APP_ID, client_secret: APP_SECRET,
        refresh_token: t.refresh_token,
      }),
    });
    const d = await res.json();
    if (!d.access_token) { console.warn('[feishu] refresh failed:', d.error || d.msg); return null; }
    const next = stamp(d, t);
    await saveTokens(next);
    return next;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

async function accessToken() {
  let t = await loadTokens();
  if (!t) return null;
  if (Date.now() > t.access_expires_at) t = await refresh();
  return t?.access_token ?? null;
}

export async function isConnected() {
  const t = await loadTokens();
  return !!(t?.refresh_token && Date.now() < t.refresh_expires_at);
}

let calListCache = { ts: 0, ids: [] };          // all calendars (primary + subscribed/shared)
let scheduleCache = { day: '', ts: 0, text: null };

// Every calendar the user owns or subscribes to, so we don't miss shared ones
// like "Hermes日程". Cached 1h (the set rarely changes).
async function listCalendarIds(auth) {
  if (calListCache.ids.length && Date.now() - calListCache.ts < 60 * 60_000) return calListCache.ids;
  const r = await fetch(`${API}/calendar/v4/calendars?page_size=50`, {
    headers: auth, signal: AbortSignal.timeout(15_000),
  }).then(r => r.json());
  const ids = (r?.data?.calendar_list ?? [])
    .filter(c => c.calendar_id)
    .map(c => c.calendar_id);
  if (ids.length) calListCache = { ts: Date.now(), ids };
  return ids;
}

// Events (recurring expanded to real occurrences) for one calendar in [s, e)
async function calendarOccurrences(calId, auth, s, e) {
  const ev = await fetch(
    `${API}/calendar/v4/calendars/${calId}/events?start_time=${s}&end_time=${e}&page_size=100`,
    { headers: auth, signal: AbortSignal.timeout(15_000) },
  ).then(r => r.json());
  const items = (ev?.data?.items ?? []).filter(it => it.status !== 'cancelled');
  return (await Promise.all(items.map(async it => {
    if (!it.recurrence || !it.event_id) {
      return [{ ts: Number(it.start_time?.timestamp ?? 0), summary: it.summary, allDay: !it.start_time?.timestamp }];
    }
    try {
      const inst = await fetch(
        `${API}/calendar/v4/calendars/${calId}/events/${it.event_id}/instances?start_time=${s}&end_time=${e}&page_size=50`,
        { headers: auth, signal: AbortSignal.timeout(15_000) },
      ).then(r => r.json());
      return (inst?.data?.items ?? [])
        .filter(x => x.status !== 'cancelled')
        .map(x => ({ ts: Number(x.start_time?.timestamp ?? 0), summary: x.summary || it.summary, allDay: !x.start_time?.timestamp }));
    } catch { return []; }
  }))).flat();
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

// Precise time-until, computed in code so the DJ never has to do clock math
function relTime(ms) {
  const diff = ms - Date.now();
  if (diff < 0) return '已过期';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `还有约 ${mins} 分钟`;
  const hrs = Math.round(diff / 3_600_000);
  if (hrs < 24) return `还有约 ${hrs} 小时`;
  return `还有约 ${Math.round(diff / 86_400_000)} 天`;
}

// Human date label relative to today: 今天/明天/周X (M月D日)
function dayLabel(d, now) {
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()) -
     new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
  if (days === 0) return '今天';
  if (days === 1) return '明天';
  return `周${WEEK[d.getDay()]}(${d.getMonth() + 1}月${d.getDate()}日)`;
}

// Upcoming events (today → +7 days) as a formatted string, or null if not
// connected / failed. Cached 10 min; on a transient fetch error we fall back to
// the cached value (the China-side Feishu API can be flaky over a foreign proxy).
export async function getSchedule() {
  if (!isConfigured()) return null;
  const today = new Date().toDateString();
  if (scheduleCache.day === today && Date.now() - scheduleCache.ts < 10 * 60_000) return scheduleCache.text;
  const token = await accessToken();
  if (!token) return scheduleCache.text; // keep last known rather than flip to null
  try {
    const auth = { Authorization: `Bearer ${token}` };
    const calIds = await listCalendarIds(auth);
    if (!calIds.length) return scheduleCache.text;

    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const s = Math.floor(dayStart.getTime() / 1000);
    const e = s + 7 * 86_400; // a week ahead so "next meeting" can be answered

    // Pull every calendar in parallel; a flaky one degrades to empty, not a throw
    const occ = (await Promise.all(
      calIds.map(id => calendarOccurrences(id, auth, s, e).catch(() => [])),
    )).flat();

    const seen = new Set();
    const lines = occ
      .filter(o => o.allDay || (o.ts >= s && o.ts < e)) // keep only this-week occurrences
      .map(o => {
        const ms = o.ts ? o.ts * 1000 : 0;
        const d = ms ? new Date(ms) : null;
        const when = d
          ? `${dayLabel(d, now)} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
          : '全天';
        const tag = ms ? (ms < now.getTime() ? '（已结束）' : `（${relTime(ms)}）`) : '';
        return { ts: o.ts, text: `${when} ${o.summary || '(无标题)'}${tag}` };
      })
      .sort((a, b) => a.ts - b.ts)
      .filter(x => !seen.has(x.text) && seen.add(x.text))
      .map(x => x.text);

    const text = lines.length ? lines.join('\n') : '未来一周日历是空的';
    scheduleCache = { day: today, ts: Date.now(), text };
    return text;
  } catch (err) {
    console.warn('[feishu]', err.message);
    return scheduleCache.text; // transient failure → serve stale instead of null
  }
}

// ---- Tasks (task:task scope: read + write) ----
let taskCache = { ts: 0, list: null };
function invalidateTasks() { taskCache = { ts: 0, list: null }; }

function taskDueLabel(due) {
  if (!due?.timestamp) return '';
  let ms = Number(due.timestamp);
  if (ms < 1e12) ms *= 1000; // tolerate seconds vs ms
  const d = new Date(ms);
  const time = due.is_all_day ? '' : ` ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  return ` · 截止 ${dayLabel(d, new Date())}${time}（${relTime(ms)}）`;
}

// Incomplete tasks [{ guid, summary, dueLabel }]. Cached 2 min; invalidated on write.
export async function getTasks() {
  if (!isConfigured()) return [];
  if (taskCache.list && Date.now() - taskCache.ts < 2 * 60_000) return taskCache.list;
  const token = await accessToken();
  if (!token) return taskCache.list ?? [];
  try {
    const r = await fetch(`${API}/task/v2/tasks?page_size=50&completed=false`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000),
    }).then(r => r.json());
    const list = (r?.data?.items ?? [])
      .filter(t => !t.completed_at || t.completed_at === '0')
      .map(t => ({ guid: t.guid, summary: t.summary || '(无标题任务)', dueLabel: taskDueLabel(t.due) }));
    taskCache = { ts: Date.now(), list };
    return list;
  } catch (err) {
    console.warn('[feishu task]', err.message);
    return taskCache.list ?? [];
  }
}

async function patchTask(guid, fields) {
  const token = await accessToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API}/task/v2/tasks/${guid}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: fields, update_fields: Object.keys(fields) }),
      signal: AbortSignal.timeout(15_000),
    });
    const d = await res.json();
    invalidateTasks();
    if (d?.code !== 0) console.warn('[feishu task patch]', d?.code, d?.msg);
    return d?.code === 0;
  } catch (err) {
    console.warn('[feishu task patch]', err.message);
    return false;
  }
}

export const completeTask = guid => patchTask(guid, { completed_at: String(Date.now()) });
export const reopenTask = guid => patchTask(guid, { completed_at: '0' });
export const updateTaskSummary = (guid, summary) => patchTask(guid, { summary });
