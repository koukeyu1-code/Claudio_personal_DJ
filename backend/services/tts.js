import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { isRestDay } from './daytype.js';

const TTS_DIR = './data/tts';
// Chinese voice: weekday = 晓晓 (warm, steady), weekend/holiday = 晓伊 (younger,
// livelier). Foreign-language songs keep their own-language voice.
const VOICE_WEEKDAY = process.env.TTS_VOICE_WEEKDAY || 'zh-CN-XiaoxiaoNeural';
const VOICE_WEEKEND = process.env.TTS_VOICE_WEEKEND || 'zh-CN-XiaoyiNeural';

mkdirSync(TTS_DIR, { recursive: true });

// Voice follows the song's language (the DJ may speak it), all female:
//   English → Sonia (en-GB), Japanese → Nanami, Korean → SunHi,
//   Chinese → 晓晓 (weekday) / 晓伊 (weekend·holiday).
async function chooseVoice(text) {
  const kana = (text.match(/[぀-ヿ]/g) || []).length;
  const hangul = (text.match(/[가-힯]/g) || []).length;
  const han = (text.match(/[一-鿿]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  if (kana > 5) return process.env.TTS_VOICE_JA || 'ja-JP-NanamiNeural';
  if (hangul > 5) return process.env.TTS_VOICE_KO || 'ko-KR-SunHiNeural';
  if (han === 0 && latin > 20) return process.env.TTS_VOICE_EN || 'en-GB-SoniaNeural';
  return (await isRestDay()) ? VOICE_WEEKEND : VOICE_WEEKDAY;
}

// Time-of-day delivery: only speed, never pitch — lowering pitch made the female
// voice sound masculine. Night = slower, morning = a touch faster.
function prosodyForNow() {
  const h = new Date().getHours();
  if (h >= 22 || h < 7) return { rate: '-8%' };
  if (h >= 7 && h < 11) return { rate: '+6%' };
  return null; // daytime / evening: default delivery
}

// Parse Edge word-boundary metadata into [{t, text}] (seconds; offsets are 100ns ticks)
function parseMarks(raw) {
  try {
    const meta = JSON.parse(raw)?.Metadata ?? [];
    return meta
      .filter(m => m.Type === 'WordBoundary' && m.Data?.text?.Text)
      .map(m => ({ t: m.Data.Offset / 1e7, text: m.Data.text.Text }));
  } catch {
    return null;
  }
}

// Synthesize text via free Edge TTS; cache mp3 + word marks by content hash.
// Returns { url, marks } — marks is null if boundaries weren't available.
export async function synthesize(text) {
  const voice = await chooseVoice(text);
  const prosody = prosodyForNow();
  const pKey = prosody ? `${prosody.rate}${prosody.pitch}` : 'def';
  const hash = createHash('md5').update(`${voice}|${pKey}|${text}`).digest('hex').slice(0, 16);
  const file = `${TTS_DIR}/${hash}.mp3`;
  const marksFile = `${TTS_DIR}/${hash}.marks.json`;
  if (!existsSync(file)) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
      wordBoundaryEnabled: true,
    });
    // v2 toFile takes an existing directory and names the files itself — rename to our hash
    const tmpDir = `${TTS_DIR}/${hash}.tmp`;
    mkdirSync(tmpDir, { recursive: true });
    try {
      const { audioFilePath, metadataFilePath } = await tts.toFile(tmpDir, text, prosody || undefined);
      if (metadataFilePath) {
        const marks = parseMarks(await readFile(metadataFilePath, 'utf8'));
        if (marks?.length) await writeFile(marksFile, JSON.stringify(marks), 'utf8');
      }
      await rename(audioFilePath, file);
    } finally {
      tts.close();
      await rm(tmpDir, { recursive: true, force: true });
    }
  }
  let marks = null;
  try { marks = JSON.parse(await readFile(marksFile, 'utf8')); } catch { /* no marks cached */ }
  return { url: `/tts/${hash}.mp3`, marks };
}
