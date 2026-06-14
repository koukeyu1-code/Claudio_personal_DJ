// Weather via Open-Meteo (free, no key). Location priority:
//   1. WEATHER_LAT/LON env override (manual, authoritative escape hatch)
//   2. device geolocation pushed from the browser (persisted across restarts)
//   3. IP geolocation (ip-api.com) — wrong behind a proxy, last resort
// Results cached 30 min.

import { readFileSync, writeFileSync } from 'node:fs';

const ENV_LAT = process.env.WEATHER_LAT;
const ENV_LON = process.env.WEATHER_LON;
const ENV_CITY = process.env.WEATHER_CITY;
const DEVICE_LOC_FILE = './data/device-loc.json';

// Persisted so a backend restart keeps the real location instead of falling
// back to the (proxy-wrong) IP until the browser happens to re-report
let deviceLoc = (() => {
  try { return JSON.parse(readFileSync(DEVICE_LOC_FILE, 'utf8')); } catch { return null; }
})();
let ipCache = null;                         // memoized IP geolocation
let weatherCache = { ts: 0, key: '', text: null };

function describe(code) {
  if (code === 0) return '晴';
  if (code <= 2) return '多云';
  if (code === 3) return '阴';
  if (code === 45 || code === 48) return '有雾';
  if (code >= 51 && code <= 57) return '毛毛雨';
  if (code >= 61 && code <= 67) return '下雨';
  if (code >= 71 && code <= 77) return '下雪';
  if (code >= 80 && code <= 82) return '阵雨';
  if (code >= 85 && code <= 86) return '阵雪';
  if (code >= 95) return '雷雨';
  return '';
}

// coords → city name (Nominatim/OSM, free, no key, Chinese via accept-language)
async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh&zoom=10&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Claudio/0.1 personal-radio' },
      signal: AbortSignal.timeout(15_000),
    });
    const a = (await res.json()).address ?? {};
    return a.city || a.town || a.county || a.state || '';
  } catch {
    return '';
  }
}

// Called from the WS layer when the browser reports its position
export async function setLocation(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return;
  // ignore tiny moves (<~1km) so we don't thrash the cache
  if (deviceLoc && Math.abs(deviceLoc.lat - lat) < 0.01 && Math.abs(deviceLoc.lon - lon) < 0.01) return;
  const city = await reverseGeocode(lat, lon);
  deviceLoc = { lat, lon, city };
  try { writeFileSync(DEVICE_LOC_FILE, JSON.stringify(deviceLoc), 'utf8'); } catch { /* ignore */ }
  weatherCache = { ts: 0, key: '', text: null }; // force refetch with new coords
  console.log(`[weather] device location set: ${city || `${lat},${lon}`}`);
}

async function geolocate() {
  // manual override wins — set it when auto-detection can't be trusted (e.g. VPN)
  if (ENV_LAT && ENV_LON) return { lat: ENV_LAT, lon: ENV_LON, city: ENV_CITY || '' };
  if (deviceLoc) return deviceLoc;
  if (ipCache) return ipCache;
  const res = await fetch('http://ip-api.com/json/?fields=status,lat,lon,city&lang=zh-CN', {
    signal: AbortSignal.timeout(8000),
  });
  const d = await res.json();
  if (d.status !== 'success') throw new Error('ip geolocation failed');
  ipCache = { lat: d.lat, lon: d.lon, city: d.city };
  return ipCache;
}

export async function getWeather() {
  const loc = await geolocate().catch(() => null);
  if (!loc) return null;
  const key = `${loc.lat},${loc.lon}`;
  if (key === weatherCache.key && Date.now() - weatherCache.ts < 30 * 60_000) return weatherCache.text;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,apparent_temperature,weather_code&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    const d = await res.json();
    const c = d.current;
    const text = `${loc.city ? `${loc.city}，` : ''}${describe(c.weather_code)}，气温 ${Math.round(c.temperature_2m)}°C，体感 ${Math.round(c.apparent_temperature)}°C`;
    weatherCache = { ts: Date.now(), key, text };
  } catch (err) {
    console.warn('[weather]', err.message);
    weatherCache = { ts: Date.now(), key, text: null }; // back off on failure too
  }
  return weatherCache.text;
}
