import type { FastifyPluginAsync } from 'fastify'
import { isMongoReady } from '../infra/mongo'
import { ok } from '../lib/http'

export const healthRoutes: FastifyPluginAsync<{ redisReady: () => boolean }> = async (app, options) => {
  app.get('/health', async (request) => ok(request, { status: 'ok', services: { api: true, mongo: isMongoReady(), redis: options.redisReady() }, timestamp: new Date().toISOString() }))
}
