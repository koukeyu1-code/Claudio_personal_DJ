const $ = id => document.getElementById(id);
const els = {
  status: $('status'), clock: $('clock'),
  wave: $('wave'), bars: $('bars'),
  glow: $('glow'), backdrop: $('backdrop'),
  trackTitle: $('trackTitle'), trackSub: $('trackSub'), cover: $('cover'),
  episode: $('episode'), cardMeta: $('cardMeta'), coverPh: $('coverPh'),
  elapsed: $('elapsed'), duration: $('duration'),
  lyrics: $('lyrics'), lyricsInner: $('lyricsInner'),
  chat: $('chat'), input: $('input'), skipBtn: $('skipBtn'),
  audio: $('audio'),
  btnPause: $('btnPause'), btnNext: $('btnNext'), btnPrev: $('btnPrev'),
};

// ---- waveform visualizer bars (driven per-frame in JS) ----
const BAR_N = 48;
els.bars.innerHTML = Array.from({ length: BAR_N }, () => '<span></span>').join('');
const barEls = [...els.bars.children];
els.wave.classList.add('paused');

function setBar(i, v) {
  barEls[i].style.transform = `scaleY(${Math.max(0.06, Math.min(1, v))})`;
}
function restBars() {
  for (let i = 0; i < BAR_N; i++) barEls[i].style.transform = 'scaleY(0.08)';
}

// Real spectrum via Web Audio AnalyserNode. CRITICAL: the audio is only routed
// through Web Audio once the AudioContext is confirmed RUNNING — routing it
// through a suspended context would mute playback. Until then audio plays
// directly (with the simulated bars). Triggered by user gestures.
let audioCtx = null, analyser = null, freqData = null, musicGain = null, analyserReady = false, analyserFailed = false;
function initAnalyser() {
  if (analyserReady || analyserFailed) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  } catch { analyserFailed = true; return; }
  audioCtx.resume().then(() => {
    if (analyserReady || analyserFailed || audioCtx.state !== 'running') return;
    try {
      const src = audioCtx.createMediaElementSource(els.audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;            // 64 frequency bins
      analyser.smoothingTimeConstant = 0.8;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      // GainNode controls the audible volume — once media routes through Web
      // Audio, els.audio.volume is bypassed, so ducking must happen here
      musicGain = audioCtx.createGain();
      src.connect(analyser);
      analyser.connect(musicGain);
      musicGain.connect(audioCtx.destination);
      analyserReady = true;
    } catch (err) {
      analyserFailed = true;            // never retry; keep audio playing directly
      console.warn('[analyser]', err.message);
    }
  }).catch(() => {});
}
// attach on any real user gesture (resume needs user activation)
['pointerdown', 'keydown'].forEach(ev =>
  window.addEventListener(ev, initAnalyser, { passive: true }));

function updateBars() {
  if (analyser) {
    analyser.getByteFrequencyData(freqData);
    let sum = 0;
    const usable = Math.floor(freqData.length * 0.85); // top bins are mostly empty
    for (let i = 0; i < BAR_N; i++) {
      const v = freqData[Math.floor((i / BAR_N) * usable)] / 255;
      sum += v;
      setBar(i, 0.06 + v * 0.94);
    }
    if (sum > 0.3) return; // real signal present — done
  }
  // fallback: stylized bass-weighted, beat-pulsing simulation
  const t = performance.now() / 1000;
  const beat = 0.55 + 0.45 * Math.pow(Math.abs(Math.sin(t * Math.PI * 1.8)), 0.6);
  for (let i = 0; i < BAR_N; i++) {
    const f = i / BAR_N;
    const wob = 0.5 * Math.sin(t * 5 + i * 0.6) + 0.5 * Math.sin(t * 2.3 + i * 0.27);
    const h = (0.55 + 0.45 * wob) * (1 - f * 0.45) * beat;
    setBar(i, 0.1 + Math.max(0, h) * 0.9);
  }
}

// ---- album-art ambiance: blurred cover tints page + halo ----
function setAmbiance(coverUrl) {
  if (coverUrl) {
    const img = `url("${coverUrl}")`;
    els.backdrop.style.backgroundImage = img;
    els.backdrop.classList.add('active');
    els.glow.style.backgroundImage = img;
  } else {
    els.backdrop.classList.remove('active');
    els.glow.style.backgroundImage = '';
  }
}

// ---- seek by tapping/dragging the waveform itself ----
function seekFromEvent(e) {
  const dur = els.audio.duration;
  if (!dur) return;
  const rect = els.wave.getBoundingClientRect();
  const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  els.audio.currentTime = frac * dur;
  updateLyricsHighlight();
}
let seeking = false;
els.wave.addEventListener('pointerdown', e => {
  if (!els.audio.duration) return;
  seeking = true;
  els.wave.setPointerCapture(e.pointerId);
  seekFromEvent(e);
});
els.wave.addEventListener('pointermove', e => { if (seeking) seekFromEvent(e); });
els.wave.addEventListener('pointerup', () => { seeking = false; });
els.wave.addEventListener('pointercancel', () => { seeking = false; });

// ---- visuals ----
let rafId = null;

function startVisuals() {
  cancelAnimationFrame(rafId);
  function tick() {
    rafId = requestAnimationFrame(tick);
    updateBars();
    updateLyricsHighlight();
  }
  tick();
}

function stopVisuals() {
  cancelAnimationFrame(rafId);
  restBars();
}

// ---- clock ----
function tickClock() {
  const d = new Date();
  els.clock.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
tickClock(); setInterval(tickClock, 30_000);

// ---- chat helpers ----
function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
// restart a CSS animation class (remove → reflow → add)
function replayAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
// ---- chat log (persisted so the conversation survives a reload) ----
const CHAT_KEY = 'claudio.chat';
let chatLog = [];
function saveChat() {
  try { localStorage.setItem(CHAT_KEY, JSON.stringify(chatLog.slice(-40))); } catch { /* ignore */ }
}
function logChat(entry) { chatLog.push(entry); saveChat(); }

function renderNotice(text) {
  const li = document.createElement('li');
  li.className = 'notice';
  li.textContent = text;
  els.chat.appendChild(li);
  els.chat.scrollTop = els.chat.scrollHeight;
}
function pushNotice(text) {
  renderNotice(text);
  logChat({ k: 'n', text });
}
// Force the chat to the very bottom for a short window. Re-pinning every frame
// covers all the async shifts (lyrics panel appearing, cover load, text reflow)
// that otherwise leave the latest bubble cut off.
let pinRaf = 0;
function scrollChatToBottom(ms = 1500) {
  const until = performance.now() + ms;
  cancelAnimationFrame(pinRaf);
  const loop = () => {
    els.chat.scrollTop = els.chat.scrollHeight;
    if (performance.now() < until) pinRaf = requestAnimationFrame(loop);
  };
  pinRaf = requestAnimationFrame(loop);
}
let listenerName = '我'; // set from the server's hello message
function renderBubble(role, text, time, trans) {
  const li = document.createElement('li');
  li.className = role === 'user' ? 'me' : 'dj';
  const who = role === 'user' ? listenerName : 'Claudio';
  li.innerHTML = `<div class="who">${who} · ${time}</div><div class="body"></div>`;
  li.querySelector('.body').textContent = text;
  if (trans) {
    const tr = document.createElement('div');
    tr.className = 'trans';
    tr.textContent = trans;
    li.appendChild(tr);
  }
  els.chat.appendChild(li);
  els.chat.scrollTop = els.chat.scrollHeight;
  return li;
}
function pushBubble(role, text) {
  const time = nowHHMM();
  const li = renderBubble(role, text, time);
  logChat({ k: 'b', role, text, time });
  return li;
}
// attach the translation to the most recent logged bubble (the DJ say bubble)
function logTrans(trans) {
  const last = chatLog[chatLog.length - 1];
  if (last && last.k === 'b') { last.trans = trans; saveChat(); }
}
function setStatus(text, idle = false) {
  els.status.textContent = text;
  els.status.classList.toggle('idle', idle);
}

// ---- lyrics ----
let lyricsLines = [];
let lyricsIdx = -1;

function parseLrc(lrc) {
  const lines = [];
  for (const line of (lrc || '').split('\n')) {
    const m = line.match(/\[(\d+):(\d+\.?\d*)\](.*)/);
    if (m) {
      const time = parseInt(m[1]) * 60 + parseFloat(m[2]);
      const text = m[3].trim();
      if (text && !/^\[/.test(text)) lines.push({ time, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

let lyricsReq = 0;

async function fetchLyrics(songId) {
  const req = ++lyricsReq;
  lyricsLines = [];
  lyricsIdx = -1;
  els.lyricsInner.innerHTML = '';
  if (!songId) { els.lyrics.classList.remove('visible'); return; }
  let lines = [];
  try {
    const data = await fetch(`/api/lyric?id=${encodeURIComponent(songId)}`).then(r => r.json());
    lines = parseLrc(data.lrc);
  } catch { /* ignore */ }
  if (req !== lyricsReq) return; // a newer track took over while we awaited
  lyricsLines = lines;
  if (lyricsLines.length === 0) { els.lyrics.classList.remove('visible'); return; }
  els.lyrics.classList.add('visible');
  renderLyrics(-1);
}

function updateLyricsHighlight() {
  if (!lyricsLines.length) return;
  const cur = els.audio.currentTime || 0;
  let idx = -1;
  for (let i = lyricsLines.length - 1; i >= 0; i--) {
    if (lyricsLines[i].time <= cur) { idx = i; break; }
  }
  if (idx === lyricsIdx) return;
  renderLyrics(idx);
}

function renderLyrics(idx) {
  lyricsIdx = idx;
  const active = idx >= 0 ? idx : 0;
  const start = Math.max(0, active - 1);
  const end = Math.min(lyricsLines.length - 1, active + 1);
  els.lyricsInner.innerHTML = '';
  for (let i = start; i <= end; i++) {
    const div = document.createElement('div');
    div.textContent = lyricsLines[i].text;
    if (i === active && idx >= 0) div.classList.add('active');
    els.lyricsInner.appendChild(div);
  }
}

// ---- audio ----
let playQueue = [];
let playIndex = 0;
let lastPlayStatus = '';

function updateControls() {
  const hasQueue = playQueue.some(t => t.url);
  const playable = playQueue.filter(t => t.url);
  const curPlayable = playable.indexOf(playQueue[playIndex]);
  els.btnNext.disabled = !hasQueue || curPlayable >= playable.length - 1;
  els.btnPrev.disabled = !hasQueue || curPlayable <= 0;
  els.btnPause.classList.toggle('is-paused', els.audio.paused);
}

function playTrack(index, dir = 1, resumeAt = null) {
  // Skip unplayable tracks in the direction of travel, so "prev" can cross gaps
  while (index >= 0 && index < playQueue.length && !playQueue[index]?.url) index += dir;
  if (index < 0) return; // nothing playable behind us — keep the current track
  playIndex = index;
  if (index >= playQueue.length) {
    if (playQueue.length) {
      els.trackTitle.textContent = playQueue[0]?.title ?? '没有可播放的歌';
      els.trackSub.textContent = `${playQueue.length} 首选好了，但 NCM 没解出可播 URL`;
    }
    els.wave.classList.add('paused');
    els.glow.classList.remove('active');
    setAmbiance(null);
    stopVisuals();
    setStatus('待机', true);
    lastPlayStatus = '';
    updateControls();
    return;
  }
  const track = playQueue[index];
  cancelAnimationFrame(duckRaf);
  setMusicVolume(1); // fresh track always starts at full volume
  els.trackTitle.textContent = track.title;
  els.trackSub.textContent = track.artist ?? '';
  replayAnim(els.cardMeta, 'anim'); // fade/slide in the new track's cover + title
  if (track.cover) {
    els.cover.src = `${track.cover}?param=200y200`;
    els.cover.hidden = false;
    els.coverPh.hidden = true;
    setAmbiance(`${track.cover}?param=400y400`);
  } else {
    els.cover.hidden = true;
    els.coverPh.hidden = false;
    setAmbiance(null);
  }
  updateMediaSession(track);
  // proxy through our origin so the AnalyserNode can read the real spectrum
  els.audio.src = `/api/audio?url=${encodeURIComponent(track.url)}`;
  fetchLyrics(track.songId ?? null);
  initAnalyser(); // no-op until a user gesture has put the context in 'running'
  const playable = playQueue.filter(t => t.url);
  lastPlayStatus = `播放中 ${playable.indexOf(track) + 1}/${playable.length}`;

  if (resumeAt != null) {
    // restored from a previous session: seek and wait for a tap (mobile blocks autoplay)
    els.audio.addEventListener('loadedmetadata', () => {
      els.audio.currentTime = Math.min(resumeAt, Math.max(0, (els.audio.duration || resumeAt) - 1));
    }, { once: true });
    els.wave.classList.add('paused');
    setStatus('点 ▶ 继续上次', true);
    updateControls();
    return;
  }

  els.audio.play().then(() => {
    els.wave.classList.remove('paused');
    els.glow.classList.add('active');
    setStatus(lastPlayStatus);
    startVisuals();
    updateControls();
  }).catch(err => {
    setStatus('自动播放被拦截 — 点 ▶', true);
    console.warn('autoplay', err);
    updateControls();
  });
  saveState();
}

function playFromQueue(queue) {
  playQueue = queue;
  playTrack(0);
  updateControls();
}

els.audio.addEventListener('pause', () => {
  els.wave.classList.add('paused');
  els.glow.classList.remove('active');
  stopVisuals();
  if (voice.paused) setStatus('已暂停', true); // keep "播报中" while the DJ is speaking
  updateControls();
});
els.audio.addEventListener('play', () => {
  els.wave.classList.remove('paused');
  els.glow.classList.add('active');
  startVisuals();
  if (lastPlayStatus) setStatus(lastPlayStatus);
  updateControls();
});
els.audio.addEventListener('ended', () => {
  const hasNext = playQueue.slice(playIndex + 1).some(t => t.url);
  if (hasNext) playTrack(playIndex + 1);
  else requestContinue(); // radio mode: queue ran dry, ask the DJ for more
});
// If the same-origin proxy can't serve (e.g. backend can't reach the CDN),
// fall back to the direct URL so playback never breaks (spectrum degrades to sim)
els.audio.addEventListener('error', () => {
  const t = playQueue[playIndex];
  if (t?.url && els.audio.src.includes('/api/audio')) {
    console.warn('[audio] proxy failed → direct url');
    els.audio.src = t.url;
    els.audio.play().catch(() => {});
  }
});

function fmt(s) { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
els.audio.addEventListener('timeupdate', () => {
  els.elapsed.textContent = fmt(els.audio.currentTime || 0);
  els.duration.textContent = fmt(els.audio.duration || 0);
});

// ---- control buttons ----
els.btnPause.addEventListener('click', () => {
  if (els.audio.paused) els.audio.play();
  else els.audio.pause();
});
els.btnNext.addEventListener('click', () => { playTrack(playIndex + 1); });
els.btnPrev.addEventListener('click', () => { playTrack(playIndex - 1, -1); });

// ---- episode (show name) ----
let currentEpisode = '';
function setEpisode(name) {
  if (!name || name === currentEpisode) return;
  currentEpisode = name;
  els.episode.textContent = `▸ ${name}`;
  els.episode.hidden = false;
  replayAnim(els.episode, 'anim');
}

// ---- media session (lock screen / bluetooth controls) ----
function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist ?? '',
    album: currentEpisode ? `Claudio · ${currentEpisode}` : 'Claudio Radio',
    artwork: track.cover ? [{ src: `${track.cover}?param=300y300`, sizes: '300x300', type: 'image/jpeg' }] : [],
  });
}
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => els.audio.play());
  navigator.mediaSession.setActionHandler('pause', () => els.audio.pause());
  navigator.mediaSession.setActionHandler('nexttrack', () => playTrack(playIndex + 1));
  navigator.mediaSession.setActionHandler('previoustrack', () => playTrack(playIndex - 1, -1));
}

// ---- DJ voice (TTS) — speaks over ducked music like a real radio host ----
const voice = new Audio();
let pendingQueue = null; // null = chat-only segment: keep the current queue playing
let pendingReason = null; // song intros, revealed only after the broadcast finishes

// reveal the song intros after the DJ finishes speaking
function flushReason() {
  if (!pendingReason) return;
  pushBubble('assistant', pendingReason);
  pendingReason = null;
  scrollChatToBottom();
}

// Smoothly fade the music volume (ducking under the DJ's voice). Routes through
// the GainNode when the Web Audio graph is live, else the element volume.
const DUCK_VOL = 0.08; // how quiet the music gets while the DJ talks
let duckRaf = null;
function setMusicVolume(v) {
  v = Math.max(0, Math.min(1, v));
  if (musicGain) musicGain.gain.value = v; else els.audio.volume = v;
}
function fadeVolume(target, ms = 400) {
  cancelAnimationFrame(duckRaf);
  const start = musicGain ? musicGain.gain.value : els.audio.volume;
  const t0 = performance.now();
  (function step(now) {
    const k = Math.min(1, (now - t0) / ms);
    setMusicVolume(start + (target - start) * k);
    if (k < 1) duckRaf = requestAnimationFrame(step);
  })(t0);
}

// Karaoke transcript: wrap each word-boundary mark in a span, light them up
// in sync with voice.currentTime
let karaokeSpans = [];
let karaokeRaf = null;

function prepareKaraoke(li, say, marks) {
  const body = li.querySelector('.body');
  body.classList.add('karaoke');
  body.textContent = '';
  karaokeSpans = [];
  let cur = 0;
  for (const m of marks) {
    const idx = say.indexOf(m.text, cur);
    if (idx === -1) continue;
    if (idx > cur) body.appendChild(document.createTextNode(say.slice(cur, idx)));
    const sp = document.createElement('span');
    sp.textContent = m.text;
    sp.dataset.t = m.t;
    body.appendChild(sp);
    karaokeSpans.push(sp);
    cur = idx + m.text.length;
  }
  if (cur < say.length) body.appendChild(document.createTextNode(say.slice(cur)));
}

function karaokeTick() {
  karaokeRaf = requestAnimationFrame(karaokeTick);
  const t = voice.currentTime;
  let current = null;
  for (const sp of karaokeSpans) {
    const spoken = Number(sp.dataset.t) <= t;
    sp.classList.toggle('spoken', spoken);
    if (spoken) current = sp;
  }
  for (const sp of karaokeSpans) sp.classList.toggle('current', sp === current && !voice.paused);
}

function stopKaraoke() {
  cancelAnimationFrame(karaokeRaf);
  // leave everything in "spoken" state, drop the cursor highlight
  for (const sp of karaokeSpans) { sp.classList.add('spoken'); sp.classList.remove('current'); }
}
voice.addEventListener('play', () => { cancelAnimationFrame(karaokeRaf); if (karaokeSpans.length) karaokeTick(); });
voice.addEventListener('ended', stopKaraoke);
voice.addEventListener('pause', () => cancelAnimationFrame(karaokeRaf));

let autoRetried = false; // one free-alternatives retry per round, no loops

function startSegment(msg) {
  const queue = msg.play || [];
  pendingQueue = queue.length ? queue : null;
  if (queue.some(t => t.url)) autoRetried = false; // got playable songs — re-arm
  if (msg.sayAudio) {
    setStatus('播报中');
    if (!els.audio.paused) fadeVolume(DUCK_VOL, 300); // duck the music under the DJ
    voice.src = msg.sayAudio;
    voice.play().catch(finishSegment); // autoplay blocked → skip straight ahead
  } else {
    finishSegment();
  }
}

// After the DJ finishes speaking: switch to the new queue, or just un-duck
function finishSegment() {
  if (pendingQueue) {
    const q = pendingQueue;
    pendingQueue = null;
    // Whole round unplayable (usually all-VIP picks) → auto-ask for free alternatives once
    if (!q.some(t => t.url) && !autoRetried && ws?.readyState === WebSocket.OPEN) {
      autoRetried = true;
      setStatus('思考中…');
      ws.send(JSON.stringify({
        type: 'message',
        intent: 'switch',
        content: '（系统：刚才推荐的歌全部因版权无法播放。请直接换 2 首同感觉但大概率免费可播的曲目——优先独立、小众、老歌，避开 VIP 曲库，不用道歉，直接推。）',
      }));
      return; // retry coming — its own say/reason will replace this round
    }
    flushReason(); // broadcast done → now reveal the song intros
    playFromQueue(q);
  } else if (!els.audio.paused) {
    fadeVolume(1, 600);
    if (lastPlayStatus) setStatus(lastPlayStatus);
  } else {
    setStatus('待机', true);
  }
}
voice.addEventListener('ended', finishSegment);
voice.addEventListener('error', finishSegment);

// ---- skipped-track notice ----
const SKIP_REASON = {
  vip: '是 VIP 歌曲，扫码登录会员账号后可播（/login）',
  unavailable: '网易云没有版权',
  notfound: '没有搜到这首歌',
  error: '解析时出错',
};

function notifySkipped(queue) {
  const skipped = queue.filter(t => !t.url);
  if (!skipped.length) return;
  const lines = skipped.map(t =>
    `《${t.title}》${SKIP_REASON[t.reason] ?? '暂时无法播放'}`
  );
  pushNotice(`已跳过 ${skipped.length} 首：${lines.join('；')}`);
}

// ---- WebSocket ----
let ws;
let focusAfterReply = false; // only re-open the keyboard after a typed message,
                             // not after 🎲 / auto-continue / scheduled shows
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/api/stream`);
  ws.onopen  = () => { setStatus('待机', true); reportLocation(); };
  ws.onclose = () => { setStatus('连接断开', true); setTimeout(connect, 2000); };
  ws.onerror = () => setStatus('连接出错', true);
  ws.onmessage = ev => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'hello') { if (msg.listener) listenerName = msg.listener; return; }
    if (msg.type === 'thinking') return setStatus('思考中…');
    if (msg.type === 'chat') {
      setEpisode(msg.episode);
      const li = pushBubble('assistant', msg.say); // broadcast text first
      if (msg.sayZh) {
        const tr = document.createElement('div');
        tr.className = 'trans';
        tr.textContent = msg.sayZh;
        li.appendChild(tr);
        logTrans(msg.sayZh);
      }
      if (msg.sayAudio && msg.sayMarks?.length) prepareKaraoke(li, msg.say, msg.sayMarks);
      notifySkipped(msg.play || []);
      (msg.notices || []).forEach(pushNotice); // task-action results (only on problems)
      pendingReason = msg.reason || null; // song intros shown after the broadcast
      scrollChatToBottom();
      startSegment(msg);
      els.skipBtn.disabled = false;
      els.input.disabled = false;
      if (focusAfterReply) els.input.focus(); // keyboard only if the user was typing
      focusAfterReply = false;
      return;
    }
    if (msg.type === 'error') {
      pushBubble('assistant', `⚠ ${msg.message}`);
      els.skipBtn.disabled = false;
      els.input.disabled = false;
      setStatus('待机', true);
    }
  };
}
connect();

// ---- device geolocation → backend (immune to VPN/proxy, follows the device) ----
function reportLocation() {
  if (!navigator.geolocation || ws?.readyState !== WebSocket.OPEN) return;
  navigator.geolocation.getCurrentPosition(
    pos => ws.send(JSON.stringify({
      type: 'location',
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
    })),
    err => console.warn('geolocation', err.message),
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30 * 60_000 },
  );
}

// ---- radio mode: auto-request the next segment when the queue runs dry ----
function requestContinue() {
  if (ws?.readyState !== WebSocket.OPEN) { playTrack(playQueue.length); return; }
  setStatus('思考中…');
  ws.send(JSON.stringify({ type: 'continue' }));
}

// ---- chat send (Enter key) — chat channel: don't switch songs by default ----
function sendChat() {
  const text = els.input.value.trim();
  if (!text || ws?.readyState !== WebSocket.OPEN) return;
  pushBubble('user', text);
  ws.send(JSON.stringify({ type: 'message', content: text, intent: 'chat' }));
  els.input.value = '';
  els.input.disabled = true;
  els.skipBtn.disabled = true;
  focusAfterReply = true; // user was typing — keep the keyboard for the next line
}
els.input.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

// ---- skip button: request new songs, honoring whatever is typed in the box ----
els.skipBtn.addEventListener('click', () => {
  if (ws?.readyState !== WebSocket.OPEN) return;
  const wish = els.input.value.trim();
  pushBubble('user', wish ? `切歌：${wish}` : '切歌');
  ws.send(JSON.stringify({
    type: 'message',
    intent: 'switch',
    content: wish
      ? `切歌，换一批新歌（2首）。我对新歌的要求：${wish}`
      : '切歌，推荐2首新歌，给出推荐理由',
  }));
  els.input.value = '';
  els.input.disabled = true;
  els.skipBtn.disabled = true;
});

// ---- resume across reloads (Plan B): persist queue + position to localStorage ----
const STATE_KEY = 'claudio.state';
let lastSave = 0;
function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      queue: playQueue,
      index: playIndex,
      time: els.audio.currentTime || 0,
      episode: currentEpisode,
    }));
  } catch { /* storage full/blocked — ignore */ }
}
els.audio.addEventListener('timeupdate', () => {
  const now = performance.now();
  if (now - lastSave > 3000) { lastSave = now; saveState(); } // throttle to ~every 3s
});
els.audio.addEventListener('pause', saveState);
els.audio.addEventListener('ended', saveState);

function restoreState() {
  let s;
  try { s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch { return; }
  if (!s?.queue?.length) return;
  playQueue = s.queue;
  if (s.episode) setEpisode(s.episode);
  const idx = Math.min(Math.max(0, s.index || 0), playQueue.length - 1);
  if (!playQueue[idx]?.url) return; // saved track isn't playable
  playTrack(idx, 1, s.time || 0); // loads + seeks, waits for a tap to resume
  updateControls();
}

// re-render the saved conversation so a reload doesn't lose the chat
function restoreChat() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]'); } catch { return; }
  if (!Array.isArray(saved) || !saved.length) return;
  chatLog = saved;
  for (const e of saved) {
    if (e.k === 'n') renderNotice(e.text);
    else renderBubble(e.role, e.text, e.time, e.trans);
  }
  els.chat.scrollTop = els.chat.scrollHeight;
}
restoreChat();
restoreState();

// ---- service worker ----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
