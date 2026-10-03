# TMusic

面向个人学习的音乐播放器工程，包含网易云 Provider、个人音乐库、一起听、双来源评论和 AI 对话入口。

## 工程结构

```text
frontend/     React + Vite 客户端（独立工程）
backend/      Node.js + Fastify + Socket.IO API（独立工程）
packages/
  contracts/  前后端共享业务契约
docs/         PRD、接口设计与源码分析
```

## 本地启动

1. 安装依赖：`npm install`。
2. 启动 MongoDB 和 Redis（可用本机服务或 `docker compose up -d mongo redis`）。
3. 启动前端、后端与 NeteaseCloudMusicApi：`npm run dev`。

若使用 Docker 启动全部基础服务，前后端请用 `dev:app`，避免重复启动播放源：

```bash
docker compose up -d --build
npm run dev:app
```

Web 默认运行在 `http://localhost:5173`，API 默认运行在 `http://localhost:4100`。
开发时 Vite 会将同源 `/api` 请求代理到后端，避免浏览器跨域问题。

也可以完全独立启动：

```bash
npm run dev -w @tmusic/web
npm run dev -w @tmusic/api
```

网易云连接、二维码登录与故障排查见 [`docs/NETEASE_SETUP.md`](docs/NETEASE_SETUP.md)。未连接上游时页面会显示本地预览数据；连接成功后目录、搜索、评论和播放地址优先来自 NeteaseCloudMusicApi。

## 一起听

打开 `/room` 创建房间，或粘贴朋友发来的邀请链接加入，无需先建立好友关系。房主可在房间内调整人数、点歌和聊天权限，授权协作者控制播放，并重置邀请链接使旧链接失效。房间使用独立的签名访客会话；每位成员仍需通过自己的网易云连接获取可播放的音频。开发时 Redis 不可用会退回单进程内存房间，正式环境必须配置 Redis 和 `ROOM_SESSION_SECRET`，否则房间服务不启用。详见 [`docs/05-listening-room-technical-roadmap.md`](docs/05-listening-room-technical-roadmap.md)。
