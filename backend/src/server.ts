import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import { Server } from 'socket.io'
import { env } from './config/env'
import { connectMongo } from './infra/mongo'
import { connectRedis } from './infra/redis'
import { NeteaseProvider } from './providers/neteaseProvider'
import { commentRoutes } from './routes/comments'
import { catalogRoutes } from './routes/catalog'
import { healthRoutes } from './routes/health'
import { playbackRoutes } from './routes/playback'
import { roomRoutes } from './routes/rooms'
import { neteaseAuthRoutes } from './routes/neteaseAuth'
import { RoomService } from './services/roomService'
import { RoomError } from './services/roomService'
import { registerRealtime } from './realtime/registerRealtime'
import { AgentFailure, AgentService } from './agent/agentService'
import { aiRoutes } from './routes/ai'

const app = Fastify({ logger: { level: env.NODE_ENV === 'development' ? 'info' : 'warn', redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.apiKey', 'body.apiKey', 'body.password', 'body.cookie', 'body.phone', 'body.captcha', 'res.headers.set-cookie'] } })

await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true })
await app.register(sensible)

const [, redis] = await Promise.all([connectMongo(app.log), connectRedis(app.log)])
const provider = new NeteaseProvider()
const rooms = new RoomService(redis)
let agentStartupError: AgentFailure | null = null
const agent = await AgentService.open(provider).catch((error) => {
  app.log.error({ err: error }, 'AI agent initialization failed')
  if (error instanceof AgentFailure) agentStartupError = error
  return null
})
const io = new Server(app.server, { path: '/realtime', cors: { origin: env.WEB_ORIGIN, credentials: true } })

await app.register(healthRoutes, { prefix: '/api/v1', redisReady: () => redis?.command.status === 'ready' })
await app.register(catalogRoutes, { prefix: '/api/v1', provider })
await app.register(neteaseAuthRoutes, { prefix: '/api/v1', provider })
await app.register(playbackRoutes, { prefix: '/api/v1', provider })
await app.register(commentRoutes, { prefix: '/api/v1', provider })
await app.register(roomRoutes, { prefix: '/api/v1', rooms, io })
await app.register(aiRoutes, { prefix: '/api/v1', agent, startupError: agentStartupError })

app.setErrorHandler((error, request, reply) => {
  if (error instanceof RoomError) return void reply.status(error.status).send({ error: { code: error.code, message: error.message, retryable: error.status >= 500 || error.status === 409 }, meta: { requestId: request.id } })
  if (error instanceof AgentFailure) return void reply.status(error.status).send({ error: { code: error.code, message: error.message, retryable: error.status >= 500 }, meta: { requestId: request.id } })
  request.log.error({ err: error }, 'Unhandled request error')
  void reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用', retryable: true }, meta: { requestId: request.id } })
})

registerRealtime(io, rooms, redis)
app.addHook('onClose', async () => { await agent?.close() })

await app.listen({ host: '0.0.0.0', port: env.PORT })
app.log.info(`TMusic API listening on http://localhost:${env.PORT}`)
