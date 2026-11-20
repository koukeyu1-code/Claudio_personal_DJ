# Claudio - 个人AI电台

基于 Claude/GLM API 的智能音乐播放器，通过网易云音乐提供流媒体服务。

## 架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   PWA Frontend  │ ←── │  Node.js Server │ ←── │  External APIs  │
│   (React/Vite)  │     │   (Express)     │     │  Claude/GLM/NCM │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              ↓
                        ┌─────────────┐
                        │   SQLite    │
                        │  State DB   │
                        └─────────────┘
```

## 功能

- AI 驱动的音乐推荐（支持 Claude/GLM）
- 网易云音乐集成
- 中文 TTS 语音播报
- UPnP 设备控制
- 用户品味学习

## 快速开始

```bash
# 安装后端依赖
cd backend && npm install

# 安装前端依赖
cd frontend && npm install

# 启动后端
cd backend && npm run dev

# 启动前端
cd frontend && npm run dev
```

## 配置

复制 `.env.example` 到 `.env` 并填写 API 密钥。
