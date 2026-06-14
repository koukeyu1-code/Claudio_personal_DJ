# 网易云音乐 API 安装指南

## 方式一：独立部署（推荐）

```bash
# 克隆项目
git clone https://github.com/Binaryify/NeteaseCloudMusicApi.git
cd NeteaseCloudMusicApi

# 安装依赖
npm install

# 启动服务（默认端口 3000）
npm start
```

修改 `.env` 中的 `NCM_API_URL=http://localhost:3000`

## 方式二：Docker 部署

```bash
docker run -d -p 3000:3000 binaryify/netease_cloud_music_api
```

## API 能力

| 接口 | 功能 |
|------|------|
| /search | 搜索歌曲 |
| /song/url | 获取播放链接 |
| /lyric | 获取歌词 |
| /recommend/songs | 每日推荐 |
| /playlist/detail | 歌单详情 |

## 测试

```bash
curl http://localhost:3000/search?keywords=周杰伦
```
