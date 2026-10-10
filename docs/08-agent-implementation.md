# Agent 模块接入与运行说明

本页记录已实现的首版能力。需求与边界见 [总体架构](./06-agent-module-architecture.md) 和 [SOP 设计](./07-agent-sop-and-pi-boundaries.md)。

## 启动条件

1. 使用 Node.js **22.19.0 或更新版本**，安装依赖：`npm install`。
2. 启动 MongoDB 和 NeteaseCloudMusicApi。AI 会话、运行投影和歌单草稿依赖 MongoDB；MongoDB 不可用时 AI API 返回 `AI_UNAVAILABLE`。
3. 编辑独立的模型配置文件 [`backend/config/agent-model.json`](../backend/config/agent-model.json)，选择 `provider`、`modelId`、`thinkingLevel`、`systemPrompt`、请求超时和工具预算。也可设置 `AI_MODEL_CONFIG_PATH` 指向其他 JSON 文件。代码不固定模型 ID 或系统提示词。
4. 可以为默认模型设置 `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY`；也可以登录后在 AI 页面填写个人的 OpenAI 兼容或 Anthropic 兼容模型、Base URL 和 Key，此时服务器无需默认模型 Key。用户 Key 用现有 `CREDENTIAL_ENCRYPTION_KEY` 做 AES-256-GCM 加密，仅密文写入 MongoDB；密钥只在模型请求时解密，不写入 Pi transcript 或前端响应。生产环境仍须设置稳定的 `AI_SESSION_SECRET` 和 `CREDENTIAL_ENCRYPTION_KEY`。
5. 启动 API 与 Web：`npm run dev:app`；需要本地网易云服务时使用 `npm run dev`。登录网易云账号后再进入 `/ai`。此前已登录的浏览器若缺少 AI 专用的 HttpOnly 签名会话 Cookie，AI 页面会通过已保存的网易云凭据验证账号、补发会话并自动重试；凭据真正失效时才需要重新登录。

**生产 Docker Compose：** `docker compose -f compose.production.yml` 在项目根目录读取 `.env`，并通过 `api.environment` 将 `AI_SESSION_SECRET`、`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` 注入 API 容器。API 镜像包含 `backend/config/agent-model.json`；修改模型配置后需要重建镜像。Pi Durable 数据保存在独立的 `agent_data` 卷中。容器内不会读取宿主机的 `backend/.env`。

若 AI API 返回 503，请先看响应中的 `error.code`：`AI_STORAGE_UNAVAILABLE` 表示 MongoDB 未连接；创建会话时的 `AI_MODEL_KEY_MISSING` 表示尚未添加用户自定义模型，且服务器默认模型 Key 也未配置；`AI_MODEL_UNAVAILABLE` 表示默认模型不在当前 pi-ai 模型目录。修改环境变量后须重启 API 进程。

用户自定义模型使用 `GET/PUT/DELETE /api/v1/ai/model-config`。首次保存必须提交 Key，以后更新配置可省略 Key 以保留原密钥；读取时只返回 `sk-****` 加末四位。Base URL 仅接受公开 HTTPS 域名，保存和发起模型请求前均检查 DNS 解析结果。生产部署仍应通过出口网络策略阻断容器访问内网地址，防止上游重定向或 DNS 重绑定绕过应用校验。更新配置只影响之后发起的 Run；运行中不能更改。

默认 Pi Durable SQLite 文件在 `backend/.local/agent.sqlite`，可用 `AI_DATA_PATH` 改到持久卷。该路径应只由**一个** API/Agent 进程持有。扩容到多个 API 进程前需将 Agent 运行时独立部署或实现经过一致性验证的共享存储。Redis 不保存 AI 会话事实源。

## 已实现的功能

| 功能 | 实现位置 |
| --- | --- |
| 模型配置与 Pi Durable 启动/重启恢复 | `backend/src/config/agentModel.ts`、`backend/src/agent/agentService.ts` |
| AI 专用登录身份与凭据绑定 | `backend/src/security/aiSession.ts`、`backend/src/routes/neteaseAuth.ts` |
| 会话、消息、Run、取消、重新生成分支、SSE | `backend/src/routes/ai.ts`、`backend/src/models/AiConversation.ts`、`AiRun.ts` |
| Plan/Todo/Step | `backend/src/agent/sop.ts`，Pi Durable `PlanDoc` 与运行投影 |
| 曲目搜索、批量详情核验、按用户意图创建歌单草稿 | `backend/src/agent/agentService.ts`、`backend/src/agent/requestIntent.ts` |
| 草稿编辑和用户确认发布 | `backend/src/routes/ai.ts`、`backend/src/models/PlaylistDraft.ts` |
| AI 页面真实数据、流式文本、状态进度、可直接播放的歌曲列表、草稿编辑 | `frontend/src/pages/AiPage.tsx`、`frontend/src/components/ai/AiRunProgress.tsx` |

模型必须先调用 `submit_plan`，提交目标、约束、假设、缺少的信息、处理方法和带验收条件的 Todo。搜索、详情与草稿工具会校验当前 Plan 中的 `todoId` 和前置依赖。工具的真正执行结果记录为 Step；`finishTodo` 要求已有成功 Step，再在 Pi 文档和 Mongo 投影中更新 Todo。公开 SSE 只含摘要、文本、卡片和状态；不转发模型内部推理或原始凭据。

用户仅要求推荐歌曲时，Run 不创建歌单草稿；搜索得到候选后用 `verify_tracks` 批量核验，页面通过复用 `TrackListItem` 展示真实曲目，点击单曲或“播放全部”即可播放。用户明确要求创建歌单时才开放草稿工具，草稿仍需用户在页面确认创建；创建成功后可进入 `/library?playlist=<id>` 查看。Run、Todo、Step 分别显示执行中、完成或失败。指定 N 首时，服务端校验已核验的去重曲目数量，不足 N 首的任务标为失败并显示实际数量，不会以完成状态展示部分结果。

每个用户请求使用 `clientMessageId` 去重，同一会话同时最多一个活跃 Run。Pi Durable 的 submission `requestId` 在重启后仍可识别重试。SSE 按 Run 序号保留最近 500 个事件，超过窗口时返回 `snapshot`；客户端也可用 `GET /ai/runs/:runId` 获取完整当前状态。

歌单发布由用户在页面点击，要求草稿版本与 `Idempotency-Key`。若网易云调用结果不确定，草稿进入 `NEEDS_RECONCILIATION`，不会自动重新创建歌单。后续需要运营/用户可见的对账与修复界面，才能完整处理这一状态。

## API 摘要

- `GET/PUT/DELETE /api/v1/ai/model-config`：读取掩码、自定义模型配置与删除；按已验证的网易云账号隔离。
- `POST /api/v1/auth/netease/ai-session`：验证已保存的网易云登录凭据并续发 AI 专用会话；不会向前端返回网易云 Cookie。
- `GET/POST /api/v1/ai/conversations`：列表与新建。
- `GET/PATCH/DELETE /api/v1/ai/conversations/:id`：读取、改名/归档、归档。
- `POST /api/v1/ai/conversations/:id/messages`：提交消息，返回 `runId` 与 `eventsUrl`。
- `GET /api/v1/ai/runs/:runId`、`GET /api/v1/ai/runs/:runId/plan`：当前状态与 SOP。
- `GET /api/v1/ai/runs/:runId/events`：SSE，支持 `Last-Event-ID` 或 `after` 游标。
- `POST /api/v1/ai/runs/:runId/cancel`：取消。
- `POST /api/v1/ai/messages/:messageId/regenerate`：从原消息前的上下文分叉到新会话重新生成。
- `GET/PATCH/DELETE /api/v1/ai/playlist-drafts/:id`：读取、编辑、丢弃草稿。
- `POST /api/v1/ai/playlist-drafts/:id/publish`：用户确认发布。

## 当前限制

- SOP 首版只创建一个 Plan 版本；`revise_plan`、`WAITING_USER`、自动验证推荐理由与公开的历史版本索引尚未实现。Todo 成功只由工具结果与证据驱动，最终回答仍需真实模型评测。
- `get_user_taste`、跨会话偏好记忆、RAG 与多 Agent 属于后续阶段，尚未接入。
- 发布后若出现 `NEEDS_RECONCILIATION`，当前不会自动判断网易云是否已创建或加完歌曲；需要人工核对后处理。
- 回答是否严格遵循 Plan 和是否只引用已核验曲目，需要接入真实模型后用固定评测集检验。当前有工具层校验与提示约束，但模型可能在最终自然语言中犯错。
- 当前机器可运行 Node 22.18 的类型检查和简单 Pi Durable 启动，但依赖声明要求 22.19.0；正式运行应升级。
