import Redis from 'ioredis'
import { env } from '../config/env'

export type RedisClients = { command: Redis; pub: Redis; sub: Redis }

export async function connectRedis(logger: { info: Function; warn: Function }): Promise<RedisClients | null> {
  const command = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false })
  command.on('error', () => undefined)
  try {
    await command.connect()
    await command.ping()
    const pub = command.duplicate()
    const sub = command.duplicate()
    pub.on('error', () => undefined)
    sub.on('error', () => undefined)
    await Promise.all([pub.connect(), sub.connect()])
    logger.info('Redis connected')
    return { command, pub, sub }
  } catch (error) {
    command.disconnect()
    logger.warn({ error }, 'Redis unavailable; realtime will use single-process memory')
    return null
  }
}
