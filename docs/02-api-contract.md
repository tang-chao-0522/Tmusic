# TMusic 接口设计文档

> 状态：Draft for Review  
> 版本：v0.1  
> 日期：2026-10-03  
> 依赖：[产品需求文档](./01-product-requirements.md)

## 1. 设计范围

本文定义 TMusic 前后端的逻辑接口契约，包括：

- REST/JSON：身份、目录、歌单、评论、房间管理和 AI 会话管理。
- WebSocket：一起听的权威播放状态、成员状态和房间聊天。
- SSE：AI 文本与结构化卡片的流式输出。

本文是设计基线，不代表第三方网易云接口。服务端必须通过 Provider Adapter 转换第三方数据，前端不得依赖网易云原始响应字段。

## 2. 通用约定

### 2.1 基础地址与版本

```text
REST:      /api/v1
WebSocket: /realtime
SSE:       /api/v1/ai/runs/:runId/events
```

- Content-Type：`application/json; charset=utf-8`。
- 时间：ISO 8601 UTC，例如 `2026-10-03T08:30:00.000Z`。
- 时长与位置：统一使用整数毫秒，字段以 `Ms` 结尾。
- ID：不透明字符串，不要求客户端理解 MongoDB ObjectId。
- 外部音乐对象由 `provider + sourceId` 唯一标识。
- API 破坏性变更升级主版本；新增可选字段不升级版本。

### 2.2 认证

推荐 Web 使用安全 Cookie：

```http
Cookie: tm_access=<short-lived-token>; tm_refresh=<rotating-token>
X-CSRF-Token: <token-for-mutating-request>
```

若使用 Bearer Token：

```http
Authorization: Bearer <access-token>
```

- 访问令牌短期有效；刷新令牌轮换，检测重用后撤销令牌族。
- WebSocket 在握手 `auth` 字段传短期访问令牌或一次性 ticket，禁止把长期令牌放入 URL。
- 写操作校验 CSRF（Cookie 模式）、Origin、身份与资源权限。

### 2.3 成功响应

单对象：

```json
{
  "data": {
    "id": "usr_01J..."
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

游标分页：

```json
{
  "data": [],
  "meta": {
    "requestId": "req_01J...",
    "nextCursor": "opaque_cursor_or_null",
    "hasMore": false
  }
}
```

删除成功返回 `204 No Content`，不再包装响应体。

### 2.4 错误响应

```json
{
  "error": {
    "code": "ROOM_FORBIDDEN",
    "message": "你没有控制该房间播放的权限",
    "details": {
      "requiredRole": "HOST_OR_CO_HOST"
    },
    "retryable": false
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

| HTTP | 场景 |
| --- | --- |
| 400 | 参数或业务状态不合法 |
| 401 | 未认证或令牌失效 |
| 403 | 无权限、被禁言或资源策略禁止 |
| 404 | 资源不存在或不可见 |
| 409 | 版本冲突、重复资源或幂等冲突 |
| 422 | JSON 合法但字段校验失败 |
| 429 | 超过频率/额度限制 |
| 502 | 第三方音乐源返回错误 |
| 503 | 依赖不可用或系统过载 |

常用错误码：`VALIDATION_ERROR`、`UNAUTHENTICATED`、`FORBIDDEN`、`NOT_FOUND`、`VERSION_CONFLICT`、`RATE_LIMITED`、`PROVIDER_UNAVAILABLE`、`TRACK_UNAVAILABLE`、`ROOM_FULL`、`ROOM_ENDED`、`ROOM_FORBIDDEN`、`COMMENT_MUTED`、`AI_QUOTA_EXCEEDED`。

### 2.5 幂等、并发与追踪

- 创建、发布评论、点赞、房间命令等可重试写请求携带 `Idempotency-Key`。
- 服务端按 `userId + route + key` 保存有限期结果；同键不同请求体返回 `409 IDEMPOTENCY_CONFLICT`。
- 歌单更新携带 `If-Match: "<version>"`；冲突返回当前版本。
- 所有请求可携带 `X-Request-ID`，服务端最终值通过同名响应头返回。
- `429`/`503` 响应尽量返回 `Retry-After`。

### 2.6 基础数据类型

#### TrackRef

```ts
type TrackRef = {
  provider: "netease" | string;
  sourceId: string;
  name: string;
  artists: Array<{ sourceId: string; name: string }>;
  album: { sourceId: string; name: string; coverUrl: string | null } | null;
  durationMs: number;
  coverUrl: string | null;
  availability: "AVAILABLE" | "LOGIN_REQUIRED" | "VIP_REQUIRED" | "REGION_BLOCKED" | "UNAVAILABLE" | "UNKNOWN";
};
```

#### UserSummary

```ts
type UserSummary = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};
```

#### CursorQuery

```text
?limit=20&cursor=<opaque>&sort=latest
```

`limit` 默认 20，最大 100。游标不允许客户端解析或修改。

## 3. 身份与用户

### 3.1 注册

`POST /auth/register`（公开）

```json
{
  "email": "user@example.com",
  "username": "music_lover",
  "password": "user-supplied-password",
  "displayName": "音乐爱好者"
}
```

返回 `201` 和当前用户。邮箱验证策略可配置；生产环境开启验证后返回 `verificationRequired: true`。

### 3.2 登录与令牌

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/auth/login` | 邮箱/用户名 + 密码登录 |
| POST | `/auth/refresh` | 轮换刷新令牌 |
| POST | `/auth/logout` | 注销当前会话 |
| POST | `/auth/logout-all` | 注销全部会话 |
| GET | `/auth/sessions` | 查看设备会话 |
| DELETE | `/auth/sessions/:sessionId` | 撤销指定会话 |

登录请求：

```json
{
  "account": "user@example.com",
  "password": "user-supplied-password"
}
```

### 3.3 当前用户与资料

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/me` | 当前用户、角色与设置 |
| PATCH | `/me` | 修改昵称、头像、简介 |
| PATCH | `/me/preferences` | 播放、隐私、通知设置 |
| GET | `/users/:userId` | 获取允许公开的资料 |

`PATCH /me/preferences` 示例：

```json
{
  "playback": { "quality": "high", "skipUnavailable": true },
  "privacy": { "showListeningActivity": true },
  "accessibility": { "reduceMotion": false }
}
```

### 3.4 网易云账户绑定（P1）

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/integrations/netease/session` | 创建受控绑定流程 |
| GET | `/integrations/netease/session/:id` | 查询扫码/验证状态 |
| DELETE | `/integrations/netease` | 解绑并销毁凭据 |

首期绑定只允许二维码流程，不接收网易云密码。不得向前端返回完整第三方 Cookie；服务端以带认证加密保存凭据，密钥与密文分离，日志必须脱敏。若第三方登录方案不满足服务条款或安全要求，应关闭该能力。

## 4. 音乐目录与播放

### 4.1 搜索与推荐

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/catalog/search?q=&limit=&offset=` | 当前实现：网易云歌曲搜索，按偏移量分页 |
| GET | `/catalog/suggestions?q=` | 搜索建议 |
| GET | `/catalog/home` | 首页聚合模块 |
| GET | `/catalog/charts` | 榜单列表 |
| GET | `/catalog/charts/:provider/:sourceId` | 榜单详情 |

当前搜索接口只支持歌曲；歌手、专辑与歌单类型属于后续扩展。`limit` 默认 30，范围 1–50；`offset` 默认 0，必须为非负整数。响应 `data.tracks` 为当前页，`meta.total` 为上游返回的总数，`meta.hasMore` 指示是否继续请求，`meta.nextCursor` 是下一页的十进制偏移量字符串（无下一页为 `null`）。上游总数可能在分页过程中变化，客户端应以每一页的 `hasMore` 为准。`home` 返回有序 section，每个 section 带稳定 `type` 与展示数据，客户端不根据标题判断类型。

### 4.2 内容详情

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/catalog/tracks/:provider/:sourceId` | 歌曲元数据 |
| GET | `/catalog/tracks/:provider/:sourceId/lyrics` | LRC/逐字歌词 |
| GET | `/catalog/albums/:provider/:sourceId` | 专辑及歌曲 |
| GET | `/catalog/artists/:provider/:sourceId` | 歌手信息 |
| GET | `/catalog/artists/:provider/:sourceId/tracks` | 歌手热门歌曲 |
| GET | `/catalog/playlists/:provider/:sourceId` | 外部歌单详情 |

歌词响应：

```json
{
  "data": {
    "kind": "LINE_SYNCED",
    "language": "zh-CN",
    "lines": [
      { "startMs": 12500, "endMs": 16400, "text": "...", "translation": null }
    ],
    "source": "netease",
    "copyright": null
  }
}
```

### 4.3 获取播放地址

`POST /playback/resolve`（登录用户；是否允许游客由环境策略决定）

```json
{
  "track": { "provider": "netease", "sourceId": "123456" },
  "quality": "high",
  "context": { "type": "playlist", "id": "pl_01J..." }
}
```

```json
{
  "data": {
    "url": "https://temporary-source.example/audio?...",
    "expiresAt": "2026-10-03T09:00:00.000Z",
    "quality": "high",
    "codec": "aac",
    "bitrate": 320000,
    "availability": "AVAILABLE"
  },
  "meta": { "requestId": "req_01J..." }
}
```

- URL 为短期能力，不得写入 MongoDB、日志、评论或分享链接。
- URL 不得进入浏览器持久化队列或 WebSocket 房间状态；本地持久层只保存 TrackRef。
- 不可播放时以明确错误码返回，不允许伪造成功 URL。
- 服务端校验音质权限、来源条款和用户会话，不绕过付费/地区限制。

### 4.4 播放行为

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/playback/events` | 批量上报 start/pause/complete/skip/error |
| GET | `/me/history` | 播放历史游标分页 |
| DELETE | `/me/history` | 清空自己的播放历史 |

事件以批量、低频方式上报，禁止按秒发送进度：

```json
{
  "events": [
    {
      "eventId": "evt_client_uuid",
      "type": "COMPLETE",
      "track": { "provider": "netease", "sourceId": "123456" },
      "positionMs": 243000,
      "occurredAt": "2026-10-03T08:30:00.000Z",
      "context": { "type": "room", "id": "room_01J..." }
    }
  ]
}
```

## 5. 喜欢与个人歌单

### 5.1 喜欢

| Method | Path | 说明 |
| --- | --- | --- |
| PUT | `/me/likes/tracks/:provider/:sourceId` | 喜欢歌曲，幂等 |
| DELETE | `/me/likes/tracks/:provider/:sourceId` | 取消喜欢，幂等 |
| GET | `/me/likes/tracks` | 喜欢歌曲列表 |
| POST | `/me/likes/tracks/status` | 批量查询喜欢状态，最多 100 个 |

### 5.2 歌单 CRUD

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/playlists` | 创建歌单 |
| GET | `/playlists/:playlistId` | 获取歌单 |
| PATCH | `/playlists/:playlistId` | 更新歌单信息，需 If-Match |
| DELETE | `/playlists/:playlistId` | 删除歌单 |
| GET | `/me/playlists` | 我的歌单 |
| GET | `/users/:userId/playlists` | 用户公开歌单 |

创建请求：

```json
{
  "name": "深夜驾驶",
  "description": "适合夜路",
  "visibility": "PRIVATE",
  "coverUrl": null
}
```

歌单响应包含 `version`、`trackCount`、`owner`、`permissions`，便于前端正确展示操作。

### 5.3 歌单歌曲

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/playlists/:playlistId/tracks` | 分页获取歌曲 |
| POST | `/playlists/:playlistId/tracks` | 批量添加，需 If-Match |
| DELETE | `/playlists/:playlistId/tracks/:itemId` | 移除，需 If-Match |
| PUT | `/playlists/:playlistId/tracks/order` | 批量排序，需 If-Match |

批量添加：

```json
{
  "tracks": [
    { "provider": "netease", "sourceId": "123456" },
    { "provider": "netease", "sourceId": "789012" }
  ],
  "duplicatePolicy": "SKIP"
}
```

排序使用最终 item ID 顺序或 `beforeItemId` 操作，MVP 选择一种并在 OpenAPI 固化；禁止仅传不稳定数组索引。

## 6. 一起听房间 REST API

REST 负责资源创建和快照，实时控制走 WebSocket。

本节 6.1 记录当前房间接口。后续房间事件示例保留早期协议草案，实际字段以 `@tmusic/contracts` 与服务端实现为准。

### 6.1 房间管理

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/rooms/session` | 创建或续签访客会话 |
| POST | `/rooms` | 创建固定双人邀请房间 |
| POST | `/rooms/:roomId/join` | 使用邀请链接中的 `code` 加入 |
| GET | `/rooms/:roomId/snapshot` | 获取权威完整快照 |
| POST | `/rooms/:roomId/leave` | 主动离开 |
| POST | `/rooms/:roomId/end` | 房主结束房间 |

创建请求：

```json
{ "initialQueue": [] }
```

创建响应：

```json
{
  "data": {
    "id": "room_01J...",
    "inviteCode": "high-entropy-token",
    "shareUrl": "https://tmusic.example/room/room_01J...?code=high-entropy-token",
    "status": "ACTIVE",
    "role": "HOST"
  },
  "meta": { "requestId": "req_01J..." }
}
```

邀请码仅在创建时返回，服务端只存哈希。房间固定最多两人，房主控制暂停；双方可拖动共听进度、从任意页面选歌，并通过 `ADD_AND_PLAY` 原子入队和同步切歌。聊天只保留在 Redis 临时列表或开发环境进程内存，房间结束时删除。

### 6.2 快照

`GET /rooms/:roomId/snapshot`

```json
{
  "data": {
    "room": {
      "id": "room_01J...",
      "name": "周六一起听",
      "status": "ACTIVE",
      "role": "MEMBER",
      "settings": { "controlMode": "HOST_ONLY", "chatEnabled": true }
    },
    "playback": {
      "stateVersion": 42,
      "track": { "provider": "netease", "sourceId": "123456", "name": "...", "artists": [], "album": null, "durationMs": 245000, "coverUrl": null, "availability": "AVAILABLE" },
      "isPlaying": true,
      "positionMs": 35000,
      "startedAt": "2026-10-03T08:30:00.000Z",
      "serverTime": "2026-10-03T08:30:10.000Z",
      "queueVersion": 7,
      "repeatMode": "QUEUE"
    },
    "queue": [],
    "members": [],
    "realtimeTicket": "short-lived-single-use-ticket"
  },
  "meta": { "requestId": "req_01J..." }
}
```

## 7. WebSocket 协议

推荐 Socket.IO 承载，但事件语义不依赖具体库。服务端在多实例部署时使用 Redis Adapter。

### 7.1 连接和信封

握手：

```ts
io("/realtime", {
  auth: { ticket: "short-lived-single-use-ticket" }
});
```

业务事件统一信封：

```ts
type ClientEvent<T> = {
  eventId: string;       // 客户端 UUID，幂等键
  roomId: string;
  sentAt: string;
  payload: T;
};

type ServerEvent<T> = {
  eventId: string;
  roomId: string;
  serverTime: string;
  payload: T;
};
```

所有客户端命令必须收到 ACK：

```ts
type Ack<T = unknown> =
  | { ok: true; data: T; serverTime: string }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; serverTime: string };
```

### 7.2 生命周期事件

| 方向 | 事件 | 用途 |
| --- | --- | --- |
| C→S | `room:join` | 用 ticket 加入并订阅房间 |
| S→C | `room:snapshot` | 完整权威快照 |
| C→S | `room:ready` | 音频已加载，可开始同步 |
| C→S | `room:leave` | 主动离开 |
| S→C | `room:member_joined` | 成员加入 |
| S→C | `room:member_left` | 成员离开/暂时断线 |
| S→C | `room:member_updated` | 角色、禁言、准备状态变化 |
| S→C | `room:ended` | 房间结束，停止接受命令 |
| C↔S | `clock:ping` / `clock:pong` | 估算 RTT 和服务端时钟偏移 |

`room:ready`：

```json
{
  "eventId": "evt_client_uuid",
  "roomId": "room_01J...",
  "sentAt": "2026-10-03T08:30:00.000Z",
  "payload": {
    "stateVersion": 42,
    "trackKey": "netease:123456",
    "bufferedUntilMs": 65000
  }
}
```

### 7.3 播放控制

| 方向 | 事件 | 说明 |
| --- | --- | --- |
| C→S | `playback:command` | 播放、暂停、跳转、切歌、切模式 |
| S→C | `playback:state` | 广播新的权威状态 |
| C→S | `playback:sync_request` | 版本断档或漂移过大时请求快照 |
| C→S | `playback:report` | 低频报告本地偏差/错误，用于观测 |

命令：

```json
{
  "eventId": "cmd_01J...",
  "roomId": "room_01J...",
  "sentAt": "2026-10-03T08:30:00.000Z",
  "payload": {
    "commandId": "cmd_01J...",
    "knownStateVersion": 42,
    "type": "SEEK",
    "positionMs": 90000
  }
}
```

`type` 与附加字段：

| type | 字段 |
| --- | --- |
| PLAY | 可选 `positionMs` |
| PAUSE | 可选 `positionMs` |
| SEEK | 必填 `positionMs` |
| NEXT | 无 |
| PREVIOUS | 无 |
| PLAY_TRACK | `trackKey`、可选 `queueItemId` |
| SET_REPEAT | `repeatMode` |

权威状态：

```json
{
  "eventId": "evt_server_01J...",
  "roomId": "room_01J...",
  "serverTime": "2026-10-03T08:30:00.120Z",
  "payload": {
    "stateVersion": 43,
    "causedByCommandId": "cmd_01J...",
    "actor": { "id": "usr_01J...", "displayName": "房主", "avatarUrl": null },
    "track": { "provider": "netease", "sourceId": "123456" },
    "isPlaying": true,
    "positionMs": 90000,
    "startedAt": "2026-10-03T08:30:00.120Z",
    "queueVersion": 7,
    "repeatMode": "QUEUE"
  }
}
```

服务端处理顺序：鉴权 → 幂等检查 → 版本检查 → 更新 Redis 原子状态 → ACK → 跨实例广播 → 异步审计。对于旧 `knownStateVersion`，非冲突命令可按规则接受；会覆盖别人状态的命令返回 `VERSION_CONFLICT` 和最新快照。

### 7.4 队列事件

| 方向 | 事件 | 说明 |
| --- | --- | --- |
| C→S | `queue:command` | 添加、移除、移动、清空 |
| S→C | `queue:updated` | 新 `queueVersion` 与操作结果 |

```json
{
  "eventId": "cmd_queue_01J...",
  "roomId": "room_01J...",
  "sentAt": "2026-10-03T08:30:00.000Z",
  "payload": {
    "commandId": "cmd_queue_01J...",
    "knownQueueVersion": 7,
    "type": "ADD",
    "tracks": [{ "provider": "netease", "sourceId": "789012" }]
  }
}
```

成员点歌模式下，普通成员只能 `ADD`，不能删除当前歌曲或重排；权限由服务端房间设置决定。

### 7.5 聊天事件

| 方向 | 事件 | 说明 |
| --- | --- | --- |
| C→S | `chat:send` | 发送文本/歌曲卡片 |
| S→C | `chat:message` | 广播已持久化消息 |
| C→S | `chat:delete` | 删除自己的消息或管理员删除 |
| S→C | `chat:message_deleted` | 广播删除状态 |
| C→S | `chat:typing` | 输入状态，易失、不持久化 |

发送文本：

```json
{
  "eventId": "evt_client_uuid",
  "roomId": "room_01J...",
  "sentAt": "2026-10-03T08:30:00.000Z",
  "payload": {
    "clientMessageId": "local_uuid",
    "type": "TEXT",
    "text": "这段前奏很好听"
  }
}
```

服务端广播：

```json
{
  "eventId": "evt_server_01J...",
  "roomId": "room_01J...",
  "serverTime": "2026-10-03T08:30:00.120Z",
  "payload": {
    "id": "msg_01J...",
    "clientMessageId": "local_uuid",
    "sender": { "id": "usr_01J...", "displayName": "小明", "avatarUrl": null },
    "type": "TEXT",
    "text": "这段前奏很好听",
    "createdAt": "2026-10-03T08:30:00.110Z"
  }
}
```

持久模式下，同一 `roomId + senderId + clientMessageId` 建 MongoDB 唯一索引；临时模式在 Redis 中对 `clientMessageId` 做 TTL 去重。typing 事件限频且不持久化。

### 7.6 重连

客户端保存最近的 `stateVersion`、`queueVersion` 和最后消息游标。重连时发送：

```json
{
  "eventId": "evt_rejoin_uuid",
  "roomId": "room_01J...",
  "sentAt": "2026-10-03T08:31:00.000Z",
  "payload": {
    "lastStateVersion": 43,
    "lastQueueVersion": 7,
    "lastMessageId": "msg_01J..."
  }
}
```

服务端若能补增量则返回增量，否则发送完整 `room:snapshot`。客户端在快照应用完成前禁用控制按钮，避免基于旧状态发命令。

## 8. 评论 API

目标由查询参数或结构化 target 指定：

```ts
type CommentTarget =
  | { type: "TRACK"; provider: string; sourceId: string }
  | { type: "PLAYLIST"; id: string };
```

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/comments?targetType=&targetId=&provider=&sort=&cursor=` | 评论列表 |
| POST | `/comments` | 发布评论或回复 |
| DELETE | `/comments/:commentId` | 删除自己的评论 |
| PUT | `/comments/:commentId/like` | 点赞，幂等 |
| DELETE | `/comments/:commentId/like` | 取消点赞，幂等 |
| GET | `/comments/:commentId/replies` | 回复分页 |
| POST | `/comments/:commentId/reports` | 举报 |

以上 `/comments` 路由只表示 TMusic 自有评论。网易云评论走 Provider 只读接口：

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/catalog/tracks/:provider/:sourceId/comments?sort=&cursor=` | 外部歌曲评论，MVP 仅 `provider=netease` |
| GET | `/catalog/playlists/:provider/:sourceId/comments?sort=&cursor=` | 外部歌单评论 |

外部评论响应必须包含 `source: "netease"`、外部评论 ID 和抓取时间，不写入本地评论集合。MVP 不提供对网易云评论的发布、回复、点赞或删除代理接口。前端以两个 Tab 分别请求，禁止把两套游标拼成一个游标。

发布评论：

```json
{
  "target": { "type": "TRACK", "provider": "netease", "sourceId": "123456" },
  "content": "这首歌的编曲很有层次。",
  "parentId": null
}
```

评论对象：

```json
{
  "id": "cmt_01J...",
  "target": { "type": "TRACK", "provider": "netease", "sourceId": "123456" },
  "author": { "id": "usr_01J...", "displayName": "小明", "avatarUrl": null },
  "rootId": "cmt_01J...",
  "parentId": null,
  "content": "这首歌的编曲很有层次。",
  "status": "VISIBLE",
  "likeCount": 0,
  "replyCount": 0,
  "likedByMe": false,
  "createdAt": "2026-10-03T08:30:00.000Z",
  "permissions": { "canDelete": true, "canReport": false }
}
```

内容只支持纯文本；服务端规范化空白、校验长度并安全转义。列表采用稳定游标，不以页码承载高频变化内容。

## 9. AI 会话、流式输出与歌单草稿

### 9.1 会话

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/ai/conversations` | 新建会话 |
| GET | `/ai/conversations` | 会话列表 |
| GET | `/ai/conversations/:conversationId` | 会话与消息分页 |
| PATCH | `/ai/conversations/:conversationId` | 重命名/归档 |
| DELETE | `/ai/conversations/:conversationId` | 删除会话 |

### 9.2 发消息并创建 Run

`POST /ai/conversations/:conversationId/messages`

```json
{
  "clientMessageId": "local_uuid",
  "content": [{ "type": "text", "text": "帮我找一些适合雨夜阅读的华语歌" }],
  "context": {
    "currentTrack": { "provider": "netease", "sourceId": "123456" },
    "allowTasteProfile": true
  }
}
```

返回 `202`：

```json
{
  "data": {
    "messageId": "aimsg_01J...",
    "runId": "airun_01J...",
    "status": "QUEUED",
    "eventsUrl": "/api/v1/ai/runs/airun_01J.../events"
  },
  "meta": { "requestId": "req_01J..." }
}
```

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/ai/runs/:runId/events` | SSE 订阅，仅限 run 所有者 |
| POST | `/ai/runs/:runId/cancel` | 停止生成，幂等 |
| POST | `/ai/messages/:messageId/regenerate` | 基于同一上下文重新生成 |

### 9.3 SSE 事件

```text
event: run.started
data: {"runId":"airun_01J..."}

event: message.delta
data: {"messageId":"aimsg_02J...","delta":"当然，"}

event: tool.started
data: {"toolCallId":"tool_01J...","name":"search_tracks","displayText":"正在搜索歌曲"}

event: content.card
data: {"type":"track","track":{"provider":"netease","sourceId":"123456"},"reason":"氛围舒缓"}

event: playlist_draft.created
data: {"draftId":"draft_01J...","name":"雨夜阅读","trackCount":12}

event: message.completed
data: {"messageId":"aimsg_02J...","finishReason":"stop"}

event: run.failed
data: {"code":"AI_PROVIDER_UNAVAILABLE","message":"AI 服务暂时不可用","retryable":true}
```

- SSE 支持 `Last-Event-ID` 恢复；服务端为近期事件保留有限缓冲。
- 不向客户端泄露模型内部思维过程、系统提示词、密钥或未经筛选的工具结果。
- 工具的 `displayText` 是可展示摘要，不等同于内部参数。

### 9.4 歌单草稿

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/ai/playlist-drafts/:draftId` | 获取草稿和推荐理由 |
| PATCH | `/ai/playlist-drafts/:draftId` | 用户编辑名称、歌曲和顺序 |
| POST | `/ai/playlist-drafts/:draftId/publish` | 用户确认并创建正式歌单 |
| DELETE | `/ai/playlist-drafts/:draftId` | 丢弃草稿 |

发布请求：

```json
{
  "visibility": "PRIVATE",
  "expectedVersion": 3
}
```

`publish` 必须由用户显式触发，支持 `Idempotency-Key`，成功返回新 `playlistId`。Agent 不持有绕过该确认的内部通道。

## 10. 管理 API（概要）

所有路由要求管理员角色并写审计日志：

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/admin/reports` | 举报列表 |
| POST | `/admin/reports/:id/resolve` | 处理举报 |
| POST | `/admin/users/:id/mute` | 禁言及期限 |
| POST | `/admin/users/:id/ban` | 封禁及理由 |
| POST | `/admin/comments/:id/hide` | 隐藏评论 |
| GET | `/admin/audit-logs` | 审计查询 |
| GET | `/admin/system/health` | 依赖健康摘要 |

管理接口不能返回第三方完整凭据、用户密码哈希或 AI 密钥。

## 11. 限流建议

具体值通过压测和运营策略调整，响应使用标准限流头。

| 能力 | 初始建议 |
| --- | --- |
| 登录 | IP + 账号每 15 分钟 10 次失败尝试 |
| 搜索 | 登录用户每分钟 60 次，游客 20 次 |
| resolve 播放地址 | 每用户每分钟 30 次，并按 track 合并并发请求 |
| 评论 | 每用户每分钟 6 条、每天 200 条 |
| 房间聊天 | 每用户每 10 秒 8 条，突发后冷却 |
| 播放控制 | 每用户每秒 10 个命令 |
| AI | 按用户并发 run、日额度、token/成本三层限制 |

## 12. 数据索引与一致性约束

建议 MongoDB 索引：

```text
users:                 email(unique), username(unique)
sessions:              userId+revokedAt, expiresAt(TTL)
playlists:             ownerId+updatedAt, visibility+updatedAt
playlist_items:        playlistId+position, playlistId+trackKey(unique)
likes:                 userId+targetType+targetKey(unique)
play_history:          userId+playedAt(desc)
room_messages:         roomId+createdAt(desc), roomId+senderId+clientMessageId(unique)
comments:              targetKey+status+createdAt(desc), rootId+createdAt
comment_likes:         commentId+userId(unique)
ai_conversations:      userId+updatedAt(desc)
ai_messages:           conversationId+createdAt
idempotency_records:   userId+route+key(unique), expiresAt(TTL)
```

- 点赞计数、回复计数可冗余，但更新需要事务、可靠事件或定期校正。
- 房间播放状态以 Redis 为运行时事实源，重要生命周期异步落 MongoDB；Redis 丢失后从最近持久快照恢复或安全结束房间。
- 队列更新使用 Redis Lua/事务保证 `queueVersion` 原子递增。

## 13. Redis Key 建议

```text
room:{roomId}:state                 HASH/JSON, TTL
room:{roomId}:members               HASH, TTL refreshed by heartbeat
room:{roomId}:queue                 JSON/ZSET
room:{roomId}:commands:{commandId}  result, short TTL
presence:user:{userId}              SET of connection ids, TTL
rate:{scope}:{subject}:{window}     counter, TTL
cache:catalog:{provider}:{type}:{id} cached normalized data
lock:provider:resolve:{trackKey}     short distributed lock
```

Key 中不得放邮箱、昵称、Cookie 或完整查询文本等敏感信息。Redis 驱逐策略与房间状态持久化策略需单独配置，避免缓存挤掉活跃状态。

## 14. OpenAPI 与事件契约交付要求

实施阶段应维护：

- `openapi.yaml`：所有 REST/SSE 建立端点、Schema、错误与示例。
- `asyncapi.yaml`：WebSocket 事件、方向、ACK 和版本策略。
- 共享 TypeScript schema 包：以 Zod/TypeBox 等生成或校验，不手写三份漂移类型。
- 契约测试：前端 mock、后端 handler、WebSocket 客户端和 Provider Adapter 均校验 schema。

接口合并门槛：OpenAPI/AsyncAPI 校验通过、破坏性变更检测通过、错误示例与权限矩阵齐全。

## 15. 权限矩阵

| 操作 | 游客 | 用户 | 协作者 | 房主 | 管理员 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 浏览公开目录 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 创建歌单/评论 |  | ✓ | ✓ | ✓ | ✓ |
| 创建房间 |  | ✓ | ✓ | ✓ | ✓ |
| 加入允许的房间 |  | ✓ | ✓ | ✓ | ✓ |
| 控制 HOST_ONLY 房间 |  |  | ✓ | ✓ | ✓* |
| 修改房间设置 |  |  |  | ✓ | ✓* |
| 删除他人评论/消息 |  |  |  | 房内有限 | ✓ |
| 发布 AI 草稿歌单 |  | 仅自己的 | 仅自己的 | 仅自己的 | 仅自己的 |

`✓*`：管理员仅在治理或应急场景执行，不应以管理员身份参与日常播放控制，操作必须审计。

## 16. 待接口评审决策

1. 后端框架选择 NestJS 还是 Fastify；本文接口语义不依赖该选择。
2. Web 身份最终采用 Cookie 还是 Bearer Token；推荐同源 Web 使用 Cookie + CSRF。
3. Socket.IO 还是原生 WebSocket；推荐 Socket.IO 以获得房间、ACK、重连和 Redis Adapter，仍需遵守本文事件语义。
4. AI 流式统一 SSE，还是复用 WebSocket；推荐 SSE，避免聊天/播放与 AI 长流互相影响。
5. 歌单排序采用“完整 item ID 数组”还是位置操作；大歌单推荐位置操作或 rank key。
6. 网易云播放地址由服务端解析还是允许客户端携带独立登录态解析；上线合规、安全与跨域方案确定后决策。
