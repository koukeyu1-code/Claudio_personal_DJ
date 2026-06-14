import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = resolve(process.env.DB_PATH || './data/state.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    role      TEXT    NOT NULL,
    content   TEXT    NOT NULL,
    ts        INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plays (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    title     TEXT    NOT NULL,
    artist    TEXT,
    song_id   TEXT,
    url       TEXT,
    ts        INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS skips (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    title     TEXT    NOT NULL,
    artist    TEXT,
    reason    TEXT,
    ts        INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS library (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    title     TEXT    NOT NULL,
    artist    TEXT,
    song_id   TEXT,
    platform  TEXT
  );
`);

const insertMsg = db.prepare('INSERT INTO messages (role, content, ts) VALUES (?, ?, ?)');
const insertPlay = db.prepare('INSERT INTO plays (title, artist, song_id, url, ts) VALUES (?, ?, ?, ?, ?)');
const recentMsgs = db.prepare('SELECT role, content, ts FROM messages ORDER BY id DESC LIMIT ?');
const recentPlays = db.prepare('SELECT title, artist, song_id, ts FROM plays ORDER BY id DESC LIMIT ?');
// distinct recently-played songs — the real "don't repeat" list (raw rows are
// full of duplicates because the same few songs get played over and over)
const distinctPlays = db.prepare(`
  SELECT title, artist, MAX(ts) AS ts FROM plays
  GROUP BY title, artist ORDER BY ts DESC LIMIT ?
`);
const weeklyTop = db.prepare(`
  SELECT title, artist, COUNT(*) AS n FROM plays
  WHERE ts > ? GROUP BY title, artist ORDER BY n DESC LIMIT ?
`);
// Candidate pool: songs from the listener's real library that haven't been
// played in the station recently and aren't blacklisted — random sample.
const libraryCandidates = db.prepare(`
  SELECT title, artist, song_id, platform FROM library
  WHERE (title || '|' || IFNULL(artist, '')) NOT IN (
    SELECT title || '|' || IFNULL(artist, '') FROM plays WHERE ts > ?
    UNION
    SELECT title || '|' || IFNULL(artist, '') FROM skips
  )
  ORDER BY RANDOM() LIMIT ?
`);
const insertSkip = db.prepare('INSERT INTO skips (title, artist, reason, ts) VALUES (?, ?, ?, ?)');
const recentSkips = db.prepare(`
  SELECT title, artist, MAX(ts) AS ts FROM skips
  GROUP BY title, artist ORDER BY ts DESC LIMIT ?
`);

export const state = {
  appendMessage(role, content) {
    insertMsg.run(role, content, Date.now());
  },
  appendPlay({ title, artist, songId, url }) {
    insertPlay.run(title, artist ?? null, songId ?? null, url ?? null, Date.now());
  },
  recentMessages(limit = 20) {
    return recentMsgs.all(limit).reverse();
  },
  recentPlays(limit = 20) {
    return recentPlays.all(limit).reverse();
  },
  recentDistinctPlays(limit = 40) {
    return distinctPlays.all(limit);
  },
  libraryCount() {
    return db.prepare('SELECT COUNT(*) AS n FROM library').get().n;
  },
  libraryCandidates(limit = 50, sinceDays = 30) {
    return libraryCandidates.all(Date.now() - sinceDays * 86_400_000, limit);
  },
  weeklyTop(limit = 10) {
    return weeklyTop.all(Date.now() - 7 * 86_400_000, limit);
  },
  appendSkip({ title, artist, reason }) {
    insertSkip.run(title, artist ?? null, reason ?? null, Date.now());
  },
  recentSkips(limit = 20) {
    return recentSkips.all(limit);
  },
};
