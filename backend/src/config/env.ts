import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/tmusic'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  NETEASE_API_URL: z.string().url().default('http://localhost:3000'),
  NETEASE_COOKIE: z.string().optional(),
  CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),
})

export const env = envSchema.parse(process.env)
