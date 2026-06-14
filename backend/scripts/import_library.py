"""One-time import of the user's real music library into state.db.

Merges the playlist export (xlsx) and the play-record export (csv, GBK) into a
`library` table, deduped by (title, artist), preferring rows that carry a
netease song_id (so the DJ can resolve them directly later).

Run:  python scripts/import_library.py
(reads ../../*.xlsx/csv from the project root, writes ./data/state.db)
"""
import csv
import os
import sqlite3

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))   # C:/Users/kouke/Claudio
DB = os.path.join(HERE, "..", "data", "state.db")
XLSX = os.path.join(ROOT, "all_playlists_merged.xlsx")
CSV = os.path.join(ROOT, "play_records_merged.csv")


def norm(s):
    return (str(s).strip() if s is not None else "")


# title|artist -> {title, artist, song_id, platform}
songs = {}


def add(title, artist, song_id, platform):
    title, artist = norm(title), norm(artist)
    if not title:
        return
    key = f"{title}|{artist}".lower()
    cur = songs.get(key)
    # prefer an entry that has a netease song_id
    if cur is None or (not cur["song_id"] and song_id):
        songs[key] = {
            "title": title, "artist": artist,
            "song_id": norm(song_id), "platform": norm(platform),
        }


wb = openpyxl.load_workbook(XLSX, read_only=True)
ws = wb.active
rows = list(ws.iter_rows(values_only=True))
head = list(rows[0])
gi = lambda name: head.index(name) if name in head else -1
ti, ai, si, pi = gi("song_name"), gi("artists"), gi("song_id"), gi("platform")
for r in rows[1:]:
    add(r[ti], r[ai], r[si] if si >= 0 else "", r[pi] if pi >= 0 else "")
print(f"xlsx 歌单读入完成，累计 {len(songs)} 首")

with open(CSV, "r", encoding="gbk", errors="replace") as f:
    for row in csv.DictReader(f):
        add(row.get("song_name"), row.get("artists"), row.get("song_id"), row.get("platform"))
print(f"csv 播放记录读入完成，累计 {len(songs)} 首不同的歌")

con = sqlite3.connect(DB)
con.execute("""
  CREATE TABLE IF NOT EXISTS library (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    title    TEXT NOT NULL,
    artist   TEXT,
    song_id  TEXT,
    platform TEXT
  )
""")
con.execute("DELETE FROM library")
con.executemany(
    "INSERT INTO library (title, artist, song_id, platform) VALUES (?,?,?,?)",
    [(s["title"], s["artist"], s["song_id"], s["platform"]) for s in songs.values()],
)
con.commit()
n = con.execute("SELECT COUNT(*) FROM library").fetchone()[0]
with_id = con.execute("SELECT COUNT(*) FROM library WHERE song_id != ''").fetchone()[0]
con.close()
print(f"✓ 已写入 library 表：{n} 首，其中 {with_id} 首带 song_id")
