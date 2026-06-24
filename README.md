# Claudio · 个人 AI 电台

一个为单一听众主持的 **AI 电台 DJ**。它会读懂你的音乐口味、当下时间/天气/日程，像电台主持人一样在歌曲之间用语音播报、点歌，把你自己的歌单变成一档「千人千面」的私人电台。

> DJ 名叫 **Claudio**，听众是你。它不是助手、不是搜索引擎——是一个会规划声音、串场播报的角色。

---

## 功能一览

- 🎙️ **AI 串场**：大模型生成口语化的 DJ 串场词，经 TTS 合成语音，在歌曲间播报（音乐自动压低垫底）
- 🎵 **从你的真实歌单选歌**：把你导出的网易云/QQ 歌单（数千首）作为候选库，按当下心情/时段挑歌，且不重复
- 🧠 **上下文感知**：当前时间、天气、作息、飞书日程、历史播放都会喂给模型，让选歌和串场贴合此刻
- 📝 **逐字稿高亮**：DJ 说话时聊天区逐词高亮（卡拉 OK 效果），非中文歌自动用对应语种播报 + 中文翻译
- 🔁 **连续电台流**：一段歌播完自动续播下一段；定时节目（早安/傍晚/晚安）到点开播
- 🎚️ **完整播放器**：实时频谱波形、专辑封面氛围色、歌词滚动、进度拖动、锁屏控制（Media Session）
- 📱 **PWA**：可安装到手机主屏；刷新/清后台后自动续播上次的歌和对话

---

## 技术栈与架构

纯 **Node.js**（Express + WebSocket，ESM，**无需构建步骤**）+ 原生 HTML/JS/CSS 前端。

```
你说话 (WebSocket)
   └─> chat-engine 汇总上下文 ──> DeepSeek 生成 JSON {串场词, 2首歌, 理由...}
          (口味/历史/天气/日程/候选曲库)        │
                                               ├─> 网易云解析成可播 URL（netease 用 song_id 直连，qq 按名搜索）
                                               └─> Edge TTS 合成串场语音
   <── 返回前端：先播报、播完放歌、聊天区显示
```

### 目录结构

```
claudio/
├── backend/
│   ├── server.js              # Express + WebSocket 入口
│   ├── routes/
│   │   ├── chat.js            # WS 入口 / GET /api/lyric / GET /api/audio(音频代理)
│   │   ├── login.js           # 网易云扫码登录
│   │   └── feishu.js          # 飞书 OAuth + 日历
│   ├── services/
│   │   ├── chat-engine.js     # 编排：消息 → 上下文 → 模型 → 解析歌曲 → TTS
│   │   ├── llm.js             # DeepSeek 调用（JSON 输出、关思考模式）
│   │   ├── ncm.js             # 网易云搜索/解析/封面
│   │   ├── tts.js             # Edge TTS（免费，多语种音色）
│   │   ├── weather.js         # Open-Meteo + 浏览器/IP 定位
│   │   ├── feishu.js          # 飞书日历（可选）
│   │   ├── scheduler.js       # 定时节目
│   │   └── state.js           # SQLite：messages / plays / skips / library
│   ├── prompts/
│   │   ├── dj-persona.md      # DJ 人设 + 输出契约（改这里调教 DJ 风格）
│   │   ├── user-music-taste.md# 你的长期口味画像
│   │   └── user-routines.md   # 你的作息（DJ 会据此挑歌）
│   ├── scripts/
│   │   └── import_library.py  # 把歌单导入 library 表（候选曲库）
│   ├── web/                   # 前端 PWA（index.html / app.js / style.css / sw.js / manifest）
│   ├── data/                  # 运行时数据（数据库/cookie/token）——已被 .gitignore 忽略
│   └── .env.example           # 环境变量模板
└── ncm/                       # NeteaseCloudMusicApi 启动器（package.json）
```

---

## 需要准备的 API / 服务

| 服务 | 必需? | 说明 | 费用 |
|---|---|---|---|
| **DeepSeek API** | ✅ 必需 | DJ 的大脑，生成串场词和选歌。需要 API Key | 按量付费（很便宜） |
| **NeteaseCloudMusicApi** | ✅ 必需 | 网易云音乐解析（搜索/播放链接/歌词），本机自建 | 免费开源 |
| 网易云账号 | ✅ 必需 | 扫码登录获取 cookie；**黑胶 VIP** 才能播 VIP 歌 | 会员另算 |
| **Edge TTS** | ✅ 内置 | 串场语音合成，免注册、免 key | 免费 |
| **Open-Meteo** | ✅ 内置 | 天气，免注册、免 key | 免费 |
| 飞书开放平台 | ⬜ 可选 | 接入日历，让 DJ 知道你的日程 | 免费 |

---

## 快速开始

### 0. 前置依赖

- **Node.js ≥ 22**（用到原生 `node:sqlite`、`--env-file`、ESM、fetch）
- **Python 3**（仅导入歌单时用，需 `pip install openpyxl`）
- **NeteaseCloudMusicApi**：

  ```bash
  git clone https://github.com/Binaryify/NeteaseCloudMusicApi.git
  cd NeteaseCloudMusicApi && npm i && PORT=3030 npm start   # 默认 3000,改 3030 避免和 Next.js 等常见默认端口冲突
  ```

### 1. 配置环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `.env`，**至少填 DeepSeek key 和你的称呼**：

```ini
DEEPSEEK_API_KEY=你的-deepseek-key
LISTENER_NAME=你的昵称        # DJ 怎么称呼你、聊天里显示的名字
NCM_API_URL=http://localhost:3030
# NCM 启动时的 PORT 要和这里一致(默认 3030,避免和 Next.js 等 3000 占用冲突)
```

再把两个个人档案模板复制成真实文件（真实文件已被 .gitignore 忽略，不会上传）：

```bash
cd backend/prompts
cp user-music-taste.example.md user-music-taste.md   # 填你的听歌口味
cp user-routines.example.md   user-routines.md        # 填你的作息（可选）
```

> 这两份文件喂给 DJ 决定选歌和语气。不填也能跑（DJ 少了点"懂你"），但建议填。

### 2. 安装并启动后端

```bash
cd backend
npm install
npm start          # http://localhost:8080
```

### 3. 登录网易云

浏览器打开 `http://localhost:8080/login`，用**网易云音乐 App 扫码**登录。
cookie 会存到 `data/ncm-cookie.txt`，之后自动带上。VIP 歌需要**黑胶会员**账号才能完整播放。

### 4. 导入你的歌单（候选曲库）

DJ 从你的真实歌单里挑歌，所以要先把歌单导入数据库。

1. 把你的歌单/播放记录导出成两个文件，放到项目能读到的位置：
   - `all_playlists_merged.xlsx` —— 收藏歌单合并
   - `play_records_merged.csv` —— 播放记录（GBK 编码）
   - 需要的列：`song_name`、`artists`、`song_id`、`platform`（netease / qq）
2. 运行导入脚本：

   ```bash
   cd backend
   pip install openpyxl
   python scripts/import_library.py
   ```

   它会去重合并、写入 SQLite 的 `library` 表（netease 平台的歌带 song_id 可直连解析，qq 平台按歌名在网易云搜）。
   > 导出工具不在本仓库内；脚本里的文件路径按需调整。

### 5. （可选）接入飞书日历

1. [open.feishu.cn](https://open.feishu.cn) 建企业自建应用，拿 App ID / Secret 填进 `.env`
2. 权限管理开通「读取日历/日程」，配重定向 URL `http://localhost:8080/api/feishu/callback`，发布版本
3. 访问 `http://localhost:8080/api/feishu/login` 扫码授权一次

### 6. 一键启动（Windows）

仓库外层的 `启动 Claudio.bat` 会依次拉起 NeteaseCloudMusicApi + 后端并打开浏览器（按需改路径）。

---

## 手机访问 / 装成 App

- **同一 WiFi**：手机浏览器打开 `http://电脑局域网IP:8080`（需放行防火墙 8080 端口）
- **任意网络 + HTTPS + 真 PWA**：用 [Tailscale](https://tailscale.com) 等内网穿透把后端配成 HTTPS（`tailscale serve --bg 8080`），手机登同一账号后用 HTTPS 地址打开，「添加到主屏」即装成 App，点图标不刷新、可远程访问
- 前提：电脑常开、后端在跑

---

## 个性化在哪改

- **DJ 风格 / 选歌规则**：`backend/prompts/dj-persona.md`
- **你的长期口味**：`backend/prompts/user-music-taste.md`
- **你的作息**：`backend/prompts/user-routines.md`
- **定时节目时段/文案**：`backend/services/scheduler.js`
- **TTS 音色**：`.env` 的 `TTS_VOICE_WEEKDAY` / `TTS_VOICE_WEEKEND`

---

## 隐私说明

以下**全部已被 `.gitignore` 忽略，不会进仓库**，里面没有任何个人信息或密钥会被上传：

| 类型 | 文件 | 说明 |
|---|---|---|
| 密钥 | `.env` | DeepSeek key、飞书 App Secret 等（仓库里只有 `.env.example` 占位）|
| 登录凭证 | `data/ncm-cookie.txt`、`data/feishu-token.json` | 网易云 cookie、飞书 token |
| 数据 | `data/state.db` | 你的歌单库、播放/对话历史 |
| 定位 | `data/device-loc.json` | 设备坐标 |
| 个人档案 | `prompts/user-music-taste.md`、`prompts/user-routines.md` | 你的真实口味与作息（仓库里只有 `.example` 模板）|

你的**称呼**也不硬编码——通过 `.env` 的 `LISTENER_NAME` 配置，仓库里是占位"听众"。

clone 本项目的人需自行：① 复制 `.env.example`→`.env` 填自己的 key 和昵称；② 复制两个 `.example` 档案填自己的口味/作息；③ 扫码登录网易云。

---

## 许可证

[MIT](LICENSE) © koukeyu1-code
