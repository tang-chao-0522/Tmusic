# Music Claw 源码专项分析：播放源、登录与凭据

> 分析对象：[CaiZongyuan/musiclaw](https://github.com/CaiZongyuan/musiclaw) `main` 分支  
> 分析日期：2026-10-03  
> 分析方式：下载仓库源码归档后静态审阅；未登录真实网易云账号做运行验证。  
> 项目场景：TMusic 仅用于个人学习，不绕过会员、版权或地区限制。

## 1. 结论先行

Music Claw 的音频不是项目自身提供的。它依赖一个单独运行的、兼容 NeteaseCloudMusicApi 路由的服务：

```text
页面选择歌曲
  → Zustand 队列只保存网易云歌曲 ID/元数据
  → PlayerEngine 发现歌曲没有 sourceUrl
  → 浏览器请求 独立网易云 API /song/url?id=...&br=320000
  → 请求附带本地网易云 Cookie 和 realIP
  → 取响应 data[0].url
  → 保存到播放器 Zustand store
  → Howler.js 以 html5: true 播放 URL
```

这个方案的“播放思路”可用，但“凭据和临时 URL 保存方式”不适合直接移植：

- 完整网易云 Cookie、`MUSIC_U`、`__csrf` 被持久化在浏览器 `localStorage`。
- Cookie 被作为 `cookie` 查询参数发送，容易出现在访问日志、代理日志和开发者工具 URL 中。
- 手机号/邮箱密码登录同样把密码放在请求查询参数中。
- 播放 URL 被放进持久化队列，刷新后仍保留；临时 URL 过期后没有正确的清除与重新解析流程。
- 默认给网易云 API 带一个固定 `realIP`，不建议在 TMusic 中照搬。

对 TMusic 的建议是：保留“网易云 ID → 服务端 Provider → 临时 URL → 浏览器 Audio Engine”的链路，改为由 TMusic 后端保管凭据并解析地址；前端永远拿不到完整网易云 Cookie。

## 2. 源码结构与职责

关键文件：

| 文件 | 职责 |
| --- | --- |
| `src/features/player/components/player-engine.tsx` | 解析当前歌曲 URL，创建 Howl，处理进度/结束/失败 |
| `src/features/track/api/track-api.ts` | 调 `/song/detail`、`/lyric`、`/song/url`、`/like` |
| `src/lib/api/client.ts` | 浏览器 Axios 客户端，向请求注入 Cookie 和 realIP |
| `src/lib/api/netease-server.ts` | SSR/Server Function 调独立网易云 API |
| `src/features/player/stores/player-store.ts` | 队列、进度、音量、播放模式及 localStorage 持久化 |
| `src/features/auth/api/auth-api.ts` | 手机、邮箱、二维码登录及 Cookie 解析 |
| `src/features/auth/stores/auth-store.ts` | 网易云登录信息的 Zustand/localStorage 持久化 |
| `src/features/auth/components/account-login-screen.tsx` | 账号登录 UI 和登录结果落库 |
| `src/features/auth/components/username-login-screen.tsx` | 公开用户搜索与只读身份选择 |

仓库不包含网易云 API 服务实现，只通过环境变量连接它：

```text
NETEASE_API_URL=http://127.0.0.1:3000
VITE_NETEASE_API_URL=http://127.0.0.1:3001  # 可选浏览器直连地址
```

所以 Music Claw 的播放能力最终取决于你部署的第三方 API 版本、网易云接口状态、账号权限和 Cookie 是否有效，而不仅取决于 Music Claw 自身代码。

## 3. 播放源是怎样获得的

### 3.1 歌曲元数据与可播放性

详情接口走 `/song/detail?ids=<id>`。项目把网易云返回的 `privileges` 合并到歌曲对象，通过 `pl`、`fee`、`cs`、`st` 和 `noCopyrightRcmd` 做一次前置可播放性判断。

这只是 UI 层预测，不是最终真相。真正能否播放仍以 `/song/url` 返回结果为准，因为：

- VIP 状态、地区、版权和 Cookie 有效性会影响 URL。
- 元数据权限与取流接口可能短暂不一致。
- 登录态在浏览器而 SSR 不知道，服务端第一次判断可能误判。

### 3.2 取播放地址

`fetchTrackSourceClient()` 调用：

```text
GET {VITE_NETEASE_API_URL 或 /api}/song/url
  id=<网易云歌曲 ID>
  br=320000
  timestamp=<当前时间>
  cookie=<浏览器保存的完整网易云 Cookie>
  realIP=<配置或默认值>
```

默认码率是 `320000`。响应取 `data[0]`，主要字段为：

```ts
{
  id: number;
  url?: string | null;
  br?: number;
  size?: number;
  type?: string;
  level?: string;
  time?: number;
  fee?: number;
  freeTrialInfo?: object | null;
}
```

只有 `url` 非空且 `freeTrialInfo == null` 才接受。否则播放器认为该源不可完整播放并自动切下一首。

仓库还保留了服务端版 `fetchTrackSource()`，但实际 PlayerEngine 使用客户端版。项目文档说明原因：账号 Cookie 只存在浏览器 localStorage，Server Function 看不到它，导致 VIP 用户拿到试听或空 URL。

### 3.3 实际播放

拿到 URL 后，播放器创建：

```ts
new Howl({
  src: [sourceUrl],
  html5: true,
  volume
})
```

使用 HTML5 Audio 模式适合较长的流式音频，不会要求浏览器先把整首歌解码进内存。Howler 负责播放、暂停、seek、音量和结束事件；Zustand 每 250 ms 从 Howl 同步一次进度。

### 3.4 失败处理

- URL 为空或为试听：调用 `skipToNext()`。
- 五秒内连续三次取源/加载失败：暂停播放器，避免无限跳歌。
- `onloaderror`：自动跳下一首。
- `onplayerror`：暂停。

但源码存在一个重要缺口：一旦 `sourceUrl` 已写入歌曲，PlayerEngine 就不会重新 resolve。播放器 Store 又把整个 queue 持久化，而 queue 项包含 `sourceUrl`。因此：

1. 临时 URL 可能被长期保存在 localStorage。
2. URL 过期后 `onloaderror` 只切歌，不清除旧 URL。
3. 再次回到该歌曲仍可能重复使用已过期 URL。

TMusic 必须把临时 URL 从持久化队列中排除，并在 401/403/404、过期时间到达或加载失败时做“一次清除 + 一次重新解析”。

### 3.5 Music Claw 没做的事

- 不托管、不上传、不转码音频。
- 不通过自己的后端转发音频字节。
- 不包含 UnblockNeteaseMusic 或多源替换逻辑；源码进度文档明确说明没有这条兜底。
- 不保证付费、VIP、无版权或地区受限歌曲可用。
- 不包含一起听同步服务。

## 4. 两种“登录模式”到底是什么

### 4.1 Account Mode：真实网易云账号态

支持三条路径：

- 二维码：`/login/qr/key` 获取 key，生成 `https://music.163.com/login?codekey=...` 二维码，每 1.2 秒调用 `/login/qr/check`；状态码 800/801/802/803 分别代表过期、等待扫码、已扫码待确认、成功。
- 手机号 + 密码：`POST /login/cellphone`。
- 邮箱 + 密码：`POST /login`。

登录结果应包含序列化 Cookie。前端从中提取：

- 完整 `rawCookie`
- `MUSIC_U`
- `__csrf`

随后调用 `/user/account` 拉用户资料。账号模式可访问喜欢歌曲、用户歌单、每日推荐、私人 FM，以及更可靠的账号权限取流。

安全问题：手机号/邮箱登录函数把 `password` 放在 Axios `params` 中，请求体为 `null`。即使 HTTPS 能保护传输，查询串仍更容易被本地历史、中间件、反向代理和访问日志记录。TMusic 不应实现网易云密码直传，个人学习场景也优先使用二维码登录。

### 4.2 Username Mode：公开资料只读模式

这个模式不是认证，也不是登录到某个网易云账号：

1. 调 `/search?type=1002` 搜索公开用户。
2. 用户选择一个结果。
3. 只把该用户的公开 `userId/nickname/avatar/vipType` 和 `loginMode=username` 写入本地。
4. `rawCookie`、`MUSIC_U`、`__csrf` 都为空。

它更像“查看某公开用户音乐库”。任何人都能选择任意公开用户，因此绝不能把它当作 TMusic 身份、权限或评论作者认证。

### 4.3 Better Auth 与网易云登录

仓库依赖 Better Auth，并保留示例路由，但当前网易云播放和音乐库权限实际依赖上述 Zustand 中的本地网易云会话。两套身份没有形成完整的服务端绑定关系。

TMusic 应明确拆成：

- `TMusic Identity`：管理评论、房间、聊天、AI、歌单和权限。
- `Netease Integration`：仅负责第三方个性化数据和在用户权限内解析播放地址。

网易云用户名只读访问不能提升为 TMusic 登录身份。

## 5. Music Claw 如何保存凭据

`auth-store.ts` 使用 Zustand `persist`，底层是 `window.localStorage`，键为：

```text
music-claw:auth
```

持久化字段包括：

```text
loginMode
profile
musicU
csrfToken
rawCookie
```

每次带账号态调用时，`apiClient` 读取 localStorage 中的 `rawCookie`，放入查询参数 `cookie`。这意味着任意同源 XSS 都能直接读取完整网易云会话；Cookie 也可能进入 API 网关访问日志。

此外，源码中的 `sanitizeSerializedCookie()` 只是移除字符串 ` HTTPOnly`，不构成加密、脱敏或浏览器 HttpOnly 保护。

### 对 TMusic 的推荐凭据方案

对“自用学习”仍建议采用最小安全架构：

```text
浏览器
  └─ 只持有 TMusic HttpOnly 会话 Cookie

TMusic Node.js 后端
  ├─ 用二维码代理完成网易云绑定
  ├─ 提取并加密保存必要网易云 Cookie
  ├─ 解密后只在调用 Netease Provider 时注入
  └─ 返回标准化元数据或短期播放 URL，不返回原 Cookie

MongoDB
  └─ encryptedCredential + keyVersion + expiresAt + lastValidatedAt

环境/KMS
  └─ 主密钥，不入库、不进 Git
```

最低要求：

- 只提供二维码绑定，不收集网易云密码。
- 使用 AES-256-GCM 等带认证的加密方式；每条凭据使用随机 nonce。
- 主密钥放环境变量或密钥服务，密文放 MongoDB，两者分离。
- 日志中删除 `cookie`、`MUSIC_U`、`__csrf`、播放 URL 查询串。
- 提供解绑并立即删除密文；检测 301/未登录等响应后标记会话失效。
- 不使用共享 VIP Cookie 给其他用户；你即使目前自用，也不要把它设计成公共解锁服务。
- 若暂不做后端加密，退化方案是浏览器 sessionStorage，仅当前标签页有效；仍不如服务端方案安全。

## 6. TMusic 推荐播放源设计

### 6.1 Provider 边界

```ts
interface MusicProvider {
  search(input: SearchInput, context: ProviderContext): Promise<SearchResult>;
  getTrack(ref: TrackRef, context: ProviderContext): Promise<Track>;
  getLyrics(ref: TrackRef, context: ProviderContext): Promise<Lyrics>;
  resolvePlayback(ref: TrackRef, quality: AudioQuality, context: ProviderContext): Promise<PlaybackGrant>;
  getComments?(ref: TargetRef, page: ExternalCommentPage): Promise<ExternalCommentPageResult>;
}
```

`PlaybackGrant` 建议返回：

```ts
type PlaybackGrant = {
  url: string;
  expiresAt: string | null;
  quality: string;
  bitrate: number | null;
  codec: string | null;
  source: "netease";
  availability: "AVAILABLE" | "LOGIN_REQUIRED" | "VIP_REQUIRED" | "REGION_BLOCKED" | "UNAVAILABLE";
};
```

### 6.2 建议取流顺序

1. 前端只传 `provider=netease`、`sourceId`、目标音质。
2. TMusic 后端根据当前 TMusic 用户读取并解密其网易云凭据。
3. Provider 调 `/song/url/v1?id=<id>&level=<level>`；若所选 API 版本不稳定，可配置回退 `/song/url?id=<id>&br=<bitrate>`。
4. 校验响应 ID、URL scheme、试听字段、实际码率和权限状态。
5. 将短期结果缓存在 Redis，TTL 不得超过源 URL 实际有效期，并预留安全余量。
6. 前端直接播放源 URL；不要把 Cookie 返回给前端，也不要让前端自行拼网易云 API 请求。
7. 加载失败时只允许一次强制刷新地址，避免重试风暴。

不要实现“VIP 解锁”“灰色歌曲解灰”或跨平台替换音源。自用学习不改变账号本身的内容权限。

### 6.3 URL 是否经过 TMusic 代理

MVP 推荐“解析 API 经过 TMusic，音频字节直连源站”：

- 优点：后端带宽和成本低，适合自用。
- 缺点：源 URL 暴露在浏览器，可能受 CORS、Referer 或源站策略影响。

只有源站明确需要隐藏凭据且条款允许时才考虑音频代理。音频代理会引入 Range、带宽、连接数、缓存和版权责任，不应作为默认方案。

### 6.4 一起听中的播放源

房间只广播歌曲引用和权威时间，不广播某个成员解析出的 URL：

```text
room state = { provider, sourceId, isPlaying, positionMs, startedAt, stateVersion }
```

每个成员用自己的权限调用 `/playback/resolve`。如果成员无权播放：

- 显示“当前歌曲在你的账号下不可用”。
- 该成员保持房间连接和聊天，不强制房主换歌。
- 不共享房主 Cookie 或播放 URL 来绕过成员权限。

## 7. 房间聊天保存策略

按你的要求，房主创建房间时可选：

| 模式 | 保存位置 | 生命周期 |
| --- | --- | --- |
| `PERSISTENT` | MongoDB | 按房间设置保留，例如 30 天，可主动清空 |
| `EPHEMERAL` | Redis Stream/List + 客户端内存 | 房间结束或最后一名成员退出时立即删除，另设短 TTL 防异常残留 |

“退出一起听就删除”建议解释为“本次一起听会话结束时删除”，而不是任一成员单独离开就删除所有人的对话。单个成员退出时清空其客户端缓存；仍在房间的人可继续看到本场临时消息，直到房间结束。

即使选择不保存，也可能保留不含正文的最小安全指标，例如消息数量、限流计数和举报事件。若用户在删除前举报，相关消息快照可以转入隔离的治理记录，并明确告知用户这一例外。

## 8. 评论来源方案

Music Claw 当前源码没有评论功能。TMusic 可以同时支持两种来源，但不建议把它们混成一条假装同源的时间线：

### 网易云评论

- Provider 只读获取歌曲/歌单评论，例如兼容 API 的 `/comment/music`、`/comment/playlist` 或新版评论接口。
- 页面标明“来自网易云”，保留外部评论 ID、昵称、头像、时间和点赞数。
- MVP 不代理发布、回复或点赞网易云评论，避免携带高权限 Cookie 执行第三方写操作。
- 外部评论不写入 TMusic MongoDB，只做短期缓存；若需缓存，保留来源与抓取时间。

### TMusic 自有评论

- 登录 TMusic 后发布，保存在 MongoDB。
- 支持回复、点赞、删除、举报和治理。
- 与网易云评论使用独立游标和排序。

UI 推荐两个 Tab：`TMusic 评论`、`网易云评论`。可提供“全部”摘要计数，但不要跨来源强行按热度混排，因为两个平台的点赞和用户体系不可比。

## 9. 对 Music Claw 实现的代码 Review

| 严重度 | 发现 | 对 TMusic 的处理 |
| --- | --- | --- |
| 高 | 完整网易云 Cookie 存 localStorage | 后端加密保存，浏览器不可读 |
| 高 | Cookie 作为 URL 查询参数 | 后端 Provider 内部通过受控请求传递，访问日志脱敏 |
| 高 | 密码作为请求查询参数 | 不提供密码直传；采用二维码绑定 |
| 高 | 临时播放 URL 随 queue 持久化 | Store 持久化时删除 URL，仅保留 TrackRef |
| 中 | 过期 URL 加载失败后不重新解析 | 清除旧 URL，单次强制 resolve，仍失败再跳歌 |
| 中 | 用户名模式看似登录但没有认证 | 明确命名为“查看公开用户”，不参与权限 |
| 中 | 固定 realIP 默认注入 | 默认不伪造 IP；仅传真实、合规的网络信息 |
| 中 | 可播放性预测把有 Cookie 近似为有云盘权限 | 以 resolve 结果为最终依据，UI 预测仅供提示 |
| 中 | 账号态与应用身份分离不彻底 | TMusic 身份与网易云 Integration 建一对一绑定 |
| 低 | 源码没有评论/房间模块 | 按 TMusic 独立模块设计，不耦合 Music Claw |

## 10. 推荐决策

面向你的个人学习场景，建议本轮直接确定：

1. TMusic 自有账号负责所有社区与房间权限。
2. 网易云只允许扫码绑定；不接收手机号/邮箱密码。
3. 网易云 Cookie 服务端加密保存，前端不可读。
4. 播放源由 Node.js Provider 解析，音频默认由浏览器直连临时 URL。
5. 临时 URL 不进入 MongoDB、localStorage、日志或 WebSocket 房间状态。
6. 房间聊天提供持久与临时两种模式；临时模式在房间结束/最后成员退出时删除。
7. 评论页分为 TMusic 评论与网易云评论；网易云评论首期只读。
8. 不实现解灰、VIP 绕过或共享账号凭据。
