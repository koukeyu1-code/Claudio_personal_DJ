// Force the process timezone so all Date math (current time, time-of-day slot,
// weekend/holiday detection, due labels) is correct regardless of how the process
// was launched. Setting process.env.TZ at runtime IS re-read by V8 on the next
// Date — unlike a TZ passed via --env-file, which is already cached at startup.
// Import this FIRST, before any module that formats time.
process.env.TZ = process.env.APP_TZ || 'Asia/Shanghai';
