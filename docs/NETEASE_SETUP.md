# NeteaseCloudMusicApi 接入

TMusic 不直接请求网易云内部接口。浏览器只访问 TMusic 后端，后端再访问本机运行的 NeteaseCloudMusicApi。

## 1. 配置环境变量

复制 `backend/.env.example` 为 `backend/.env`，生成一个仅用于本机的 32 字节加密密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

生产环境将输出写入。开发环境不配置时，后端会自动在 `backend/.local/credential.key` 创建本机密钥；请保留该文件，否则既有登录凭据无法解密。

```dotenv
NETEASE_API_URL=http://localhost:3000
CREDENTIAL_ENCRYPTION_KEY=生成的Base64内容
```

不要把真实 Cookie 或 `.env` 提交到 Git。`NETEASE_COOKIE` 仅用于无用户上下文的公开目录请求；个人资料、音乐库和播放权限只使用当前浏览器扫码保存的凭据。前端会为每个浏览器生成匿名标识；它不能替代正式账号认证。

## 2. 启动依赖

```bash
docker compose up -d --build netease-api mongo redis
```

NeteaseCloudMusicApi 使用官方默认端口 `3000`。Docker 构建固定安装 `NeteaseCloudMusicApi@4.32.0`。

检查上游和 TMusic 代理：

```bash
curl http://localhost:3000/login/status
curl http://localhost:4100/api/v1/providers/netease/health
```

## 3. 二维码登录

创建二维码：

```bash
curl -X POST -H "content-type: application/json" -H "x-user-id: dev-user" -d "{}" http://localhost:4100/api/v1/auth/netease/qr
```

响应中的 `qrImage` 是可直接放进 `<img src>` 的 Base64 Data URL。使用网易云音乐 App 扫码并确认，然后每 2～3 秒检查一次：

```bash
curl -H "x-user-id: dev-user" "http://localhost:4100/api/v1/auth/netease/qr/status?key=上一步返回的key"
```

状态码：`800` 已过期、`801` 等待扫码、`802` 等待确认、`803` 登录成功。成功后 TMusic 只在服务端使用 AES-256-GCM 加密 Cookie，接口不会把 Cookie 返回给浏览器。

检查登录状态：

```bash
curl -H "x-user-id: dev-user" http://localhost:4100/api/v1/auth/netease/status
```

退出并删除本地凭据：

```bash
curl -X DELETE -H "x-user-id: dev-user" http://localhost:4100/api/v1/auth/netease/session
```

## 4. 播放链路

前端点击歌曲后调用 TMusic 的 `POST /api/v1/playback/resolve`。后端带上当前用户加密保存的 Cookie 调用 NeteaseCloudMusicApi 的 `/song/url/v1`，默认请求 `exhigh`，再把短期播放 URL 返回给浏览器。

付费、版权受限或账号无权限的歌曲不会绕过限制；接口会返回明确的 `LOGIN_REQUIRED`、`VIP_REQUIRED` 或 `UNAVAILABLE` 状态。

## 常见问题

- `502 NETEASE_API_UNAVAILABLE`：确认 `docker compose ps` 中 `netease-api` 健康，并检查 `3000` 端口。
- 页面显示本地预览数据：说明 `/catalog/home` 无法从上游取得歌曲，检查 NeteaseCloudMusicApi 日志。
- 扫码后无法保存：MongoDB 或 `CREDENTIAL_ENCRYPTION_KEY` 未配置。
- Docker 环境莫名走代理：官方文档说明代理环境变量会影响请求，因此 compose 中已显式清空这些变量。
- 二维码 Cookie 不应调用 `/login/refresh`；需要重新认证时重新扫码。
