// Is today a rest day — weekend OR a CN statutory holiday (accounting for 调休,
// where a Saturday/Sunday can be a make-up workday)? Drives the weekend voice and
// a more relaxed DJ tone. Cached per calendar day; if the holiday API is
// unreachable it degrades to plain Sat/Sun.
let cache = { day: '', rest: null };

export async function isRestDay() {
  const now = new Date();
  const key = now.toDateString();
  if (cache.day === key && cache.rest !== null) return cache.rest;

  const dow = now.getDay();
  let rest = dow === 0 || dow === 6; // weekend by default
  try {
    const pad = n => String(n).padStart(2, '0');
    const ds = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const r = await fetch(`https://timor.tech/api/holiday/info/${ds}`, {
      signal: AbortSignal.timeout(6000),
    }).then(r => r.json());
    // type.type: 0 工作日 / 1 周末 / 2 节假日 / 3 调休(需上班)
    const t = r?.type?.type;
    if (t === 0 || t === 1 || t === 2 || t === 3) rest = t === 1 || t === 2;
  } catch { /* keep the weekend default */ }

  cache = { day: key, rest };
  return rest;
}
