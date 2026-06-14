import { readFile } from 'node:fs/promises';
import { state } from './state.js';
import { ask, LISTENER } from './llm.js';
import { resolve as resolveSong, resolveById } from './ncm.js';
import { synthesize } from './tts.js';
import { getWeather } from './weather.js';
import { getSchedule, getTasks, completeTask, reopenTask, updateTaskSummary } from './feishu.js';
import { isRestDay } from './daytype.js';

async function loadRoutines() {
  try { return (await readFile('./prompts/user-routines.md', 'utf8')).trim(); } catch { return null; }
}

// Execute a write the DJ asked for, after matching its target text to a real
// task. The persona only emits taskAction AFTER the user has confirmed, so this
// is the confirmed step. Returns notices to show the listener (only on problems).
async function applyTaskAction(action, tasks) {
  if (!action?.op || !action?.task) return [];
  const norm = s => (s || '').trim().toLowerCase();
  const target = norm(action.task);
  const match = tasks.find(t => norm(t.summary) === target)
    || tasks.find(t => norm(t.summary).includes(target) || (target && target.includes(norm(t.summary))));
  if (!match) return [`⚠ 没在飞书任务里找到《${action.task}》，没有改动`];
  let ok = false;
  if (action.op === 'complete') ok = await completeTask(match.guid);
  else if (action.op === 'reopen') ok = await reopenTask(match.guid);
  else if (action.op === 'update' && action.summary) ok = await updateTaskSummary(match.guid, action.summary);
  else return [];
  return ok ? [] : ['⚠ 飞书任务操作失败了，请稍后再试'];
}

export async function handleMessage(message, intent = 'chat') {
  // Snapshot history before appending so the current message isn't sent twice
  const history = state.recentMessages(10);
  state.appendMessage('user', message);
  const [weather, routines, schedule, tasks, dayRest] = await Promise.all([getWeather(), loadRoutines(), getSchedule(), getTasks(), isRestDay()]);
  const avoid = state.recentDistinctPlays(40); // distinct, so the avoid-list is real
  // When picking songs, draw from the listener's real 3500-song library (fresh,
  // on-taste) instead of letting the model free-associate from memory
  const candidates = intent === 'chat' ? [] : (state.libraryCount() ? state.libraryCandidates(50) : []);
  const context = {
    recentPlays: avoid,
    weeklyTop: state.weeklyTop(10),
    unplayable: state.recentSkips(30),
    candidates,
    weather,
    routines,
    schedule,
    tasks,
    dayRest,
  };
  let dj = await ask({ userMessage: message, history, intent, context });

  // Deterministic no-repeat: the model is unreliable at honoring the avoid-list
  // (taste is concentrated — it circles the same ~50 songs), so re-ask up to a
  // couple times and keep the response with the FEWEST repeats.
  if (intent !== 'chat' && dj.play.length) {
    const keyOf = p => `${(p.title || '').trim()}|${(p.artist || '').trim()}`;
    const avoidSet = new Set([...avoid, ...context.unplayable].map(keyOf));
    const repeatsOf = r => r.play.filter(p => avoidSet.has(keyOf(p)));
    let bestRep = repeatsOf(dj);
    for (let tries = 0; bestRep.length && tries < 2; tries++) {
      console.warn('[chat] repeats caught, re-asking:', bestRep.map(d => d.title));
      const retry = await ask({
        userMessage: `${message}\n（系统：你刚推荐的《${bestRep.map(d => d.title).join('》《')}》${LISTENER}最近都听过了。请重新推荐 2 首他最近没听过的歌——大胆跳出他的常听列表，找符合口味但更新鲜、冷门的曲目，2 首都不能在最近播放里。）`,
        history,
        intent: 'switch',
        context,
      });
      const rep = repeatsOf(retry);
      if (retry.play.length && rep.length < bestRep.length) { dj = retry; bestRep = rep; }
    }
  }

  // Persona contract: dj.play is already in playback order.
  // Promise.all preserves input order, so concurrent resolution is safe.
  // Unresolvable songs stay in the list with url:null + reason, so the
  // frontend can tell the listener what was skipped and why.
  // TTS for the say-text runs in parallel with song resolution.
  // Map each pick back to its library entry so netease songs resolve by exact
  // song_id (no wrong-version guessing); everything else falls back to search.
  const norm = s => (s || '').trim().toLowerCase();
  const byKey = new Map(candidates.map(c => [`${norm(c.title)}|${norm(c.artist)}`, c]));
  const [queue, sayTts, taskNotices] = await Promise.all([
    Promise.all(dj.play.map(async item => {
      const fallback = { songId: null, title: item.title, artist: item.artist ?? null, url: null };
      const cand = byKey.get(`${norm(item.title)}|${norm(item.artist)}`);
      try {
        let hit;
        if (cand?.platform === 'netease' && cand.song_id) {
          hit = await resolveById(cand.song_id, { title: item.title, artist: item.artist });
        } else {
          hit = await resolveSong([item.title, item.artist].filter(Boolean).join(' '));
        }
        if (!hit) return { ...fallback, reason: 'notfound' };
        return hit;
      } catch {
        return { ...fallback, reason: 'error' };
      }
    })),
    dj.say
      ? synthesize(dj.say).catch(err => { console.warn('[tts]', err.message); return null; })
      : Promise.resolve(null),
    applyTaskAction(dj.taskAction, tasks), // confirmed task write (no-op if none)
  ]);

  for (const track of queue) {
    if (track.url) state.appendPlay(track);
    // Only blacklist real availability problems — a transient 'error' (e.g. NCM
    // API down) must not permanently ban an otherwise-fine song.
    else if (track.reason && track.reason !== 'error') state.appendSkip(track);
  }

  // Prefix the episode name so the model sees it in history and keeps it stable
  state.appendMessage('assistant', dj.episode ? `[${dj.episode}] ${dj.say}` : dj.say);
  return {
    episode: dj.episode,
    say: dj.say,
    sayZh: dj.sayZh,
    sayAudio: sayTts?.url ?? null,
    sayMarks: sayTts?.marks ?? null,
    play: queue,
    reason: dj.reason,
    segue: dj.segue,
    notices: taskNotices,
  };
}
