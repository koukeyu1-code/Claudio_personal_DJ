import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const NCM_API_URL = process.env.NCM_API_URL || 'http://localhost:3000';

// NCM cover URLs are http; upgrade to https so they aren't blocked as mixed
// content when the app is served over HTTPS (Tailscale)
const httpsCover = u => (u ? u.replace(/^http:/, 'https:') : null);
const COOKIE_FILE = './data/ncm-cookie.txt';

mkdirSync('./data', { recursive: true });

let NCM_COOKIE = (() => {
  try { return readFileSync(COOKIE_FILE, 'utf8').trim(); } catch { return ''; }
})() || (process.env.NCM_COOKIE || '');

export function setCookie(cookie) {
  NCM_COOKIE = cookie;
  try { writeFileSync(COOKIE_FILE, cookie, 'utf8'); } catch { /* ignore */ }
}

async function get(path, params) {
  const url = new URL(path, NCM_API_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (NCM_COOKIE) url.searchParams.set('cookie', NCM_COOKIE);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Claudio/0.0.1' }, signal: ac.signal });
    if (!res.ok) throw new Error(`ncm ${path} ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Skip karaoke/instrumental/ringtone variants that cloudsearch sometimes ranks first
const BAD_VARIANT = /伴奏|纯音乐|铃声|DJ版|抖音|翻唱/i;

export async function search(keywords) {
  // cloudsearch returns richer fields than /search — notably al.picUrl (album cover)
  const data = await get('/cloudsearch', { keywords, limit: 5 });
  const songs = data?.result?.songs ?? [];
  if (!songs.length) return null;
  const song = songs.find(s => !BAD_VARIANT.test(s.name)) ?? songs[0];
  return {
    songId: String(song.id),
    title: song.name,
    artist: (song.ar ?? song.artists)?.map(a => a.name).join(' / ') || null,
    cover: httpsCover(song.al?.picUrl),
  };
}

export async function songUrl(id) {
  const data = await get('/song/url', { id, br: 320000 });
  const item = data?.data?.[0];
  if (!item?.url) return { url: null, reason: 'unavailable' };
  // freeTrialInfo = anonymous/non-VIP account only gets a 30s clip; with a
  // logged-in VIP cookie the same call returns the full url and no trial info
  if (item.freeTrialInfo) return { url: null, reason: 'vip' };
  return { url: item.url, reason: null };
}

export async function resolve(query) {
  const hit = await search(query);
  if (!hit) return null;
  const { url, reason } = await songUrl(hit.songId);
  return { ...hit, url, reason };
}

async function songDetail(id) {
  const data = await get('/song/detail', { ids: id });
  const s = data?.songs?.[0];
  if (!s) return null;
  return {
    title: s.name,
    artist: (s.ar ?? s.artists)?.map(a => a.name).join(' / ') || null,
    cover: httpsCover(s.al?.picUrl),
  };
}

// Resolve a known netease song_id directly — exact track, no search guessing.
// fallback supplies title/artist if the detail call fails.
export async function resolveById(id, fallback = {}) {
  const [{ url, reason }, meta] = await Promise.all([
    songUrl(id),
    songDetail(id).catch(() => null),
  ]);
  return {
    songId: String(id),
    title: meta?.title ?? fallback.title ?? null,
    artist: meta?.artist ?? fallback.artist ?? null,
    cover: meta?.cover ?? null,
    url,
    reason,
  };
}
