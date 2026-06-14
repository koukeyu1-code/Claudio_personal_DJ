# Claudio Backend (vertical slice)

最小可跑链路:`POST /api/chat` 或 WS `/api/stream` → 拼 prompt → DeepSeek Chat API(JSON 输出) → 解析 `{say, play[], reason, segue}` → 走网易云 API 把歌名解析成可播 URL → 返回。

## 0. 前置依赖

- **Node.js ≥ 22**(用到原生 fetch、ESM 与 `node:sqlite`)
- **DeepSeek API Key**(写入 `.env` 的 `DEEPSEEK_API_KEY`)
- **NeteaseCloudMusicApi** 在本机跑起来:

  ```bash
  git clone https://github.com/Binaryify/NeteaseCloudMusicApi.git
  cd NeteaseCloudMusicApi && npm i && npm start   # 默认 :3000
  ```

## 1. 安装

```bash
cd claudio/backend
cp .env.example .env       # 按需改 PORT / NCM_API_URL
npm install
```

## 2. 启动

```bash
npm start                  # http://localhost:8080
# 或
npm run dev                # 文件热重载
```

## 3. 自检

```bash
curl http://localhost:8080/api/health
# {"ok":true,"name":"claudio","version":"0.0.1"}

curl -X POST http://localhost:8080/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"hi Claudio, kick off the show with two upbeat songs"}'

# Windows 上中文走命令行会被代码页改字节,改用 UTF-8 文件:
curl -X POST http://localhost:8080/api/chat \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary @data/test-body.json
```

预期返回(歌曲随机):

```json
{
  "say": "...口语化串场...",
  "play": [
    { "songId": "...", "title": "...", "artist": "...", "url": "https://..." }
  ],
  "reason": "...",
  "segue": "..."
}
```

## 4. 目录

```
backend/
├── server.js              # express + ws 入口(WS: /api/stream)
├── routes/
│   ├── chat.js            # POST /api/chat、GET /api/lyric
│   └── login.js           # 网易云扫码登录(/api/login/qr/*)
├── services/
│   ├── llm.js             # DeepSeek Chat API(JSON 输出)
│   ├── chat-engine.js     # 消息 → LLM → 解析歌曲队列
│   ├── ncm.js             # 网易云 search + song/url
│   └── state.js           # node:sqlite:messages / plays
├── prompts/dj-persona.md  # DJ 人设 + 输出契约
├── web/                   # 前端静态页(PWA:manifest + sw.js)
└── data/state.db          # 自动生成
```

## 5. 已知边界

- 串场词由 Edge TTS 朗读(免费,需联网)。
- 已注入:当前时间、天气(Open-Meteo,IP 定位或 .env 固定坐标)、作息(prompts/user-routines.md)、播放/跳过记忆。
- 定时节目:08:30 早安 / 18:30 傍晚 / 22:30 晚安(services/scheduler.js,有客户端在线才开播)。
- 开代理时 IP 定位会指到出口节点城市,建议在 .env 填 WEATHER_LAT/LON/CITY。
- 网易云返回的 `url` 受版权与登录态限制可能为空,前端要兜底(可在 /login 扫码登录提高解析成功率)。
