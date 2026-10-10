import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { env } from './env'

const schema = z.object({
  provider: z.enum(['openai', 'anthropic']),
  modelId: z.string().min(1),
  thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']),
  systemPrompt: z.string().min(1).max(10000),
  requestTimeoutMs: z.number().int().min(1000).max(600000),
  maxToolCallsPerRun: z.number().int().min(1).max(30),
  maxPlanTodos: z.number().int().min(1).max(12),
  maxSearchResults: z.number().int().min(1).max(20),
  customModelContextWindow: z.number().int().min(4096).max(2000000),
  customModelMaxTokens: z.number().int().min(256).max(100000),
}).strict()

export type AgentModelConfig = z.infer<typeof schema>

export async function loadAgentModelConfig(): Promise<AgentModelConfig> {
  const backendRoot = existsSync(path.join(process.cwd(), 'backend', 'package.json')) ? path.join(process.cwd(), 'backend') : process.cwd()
  const file = env.AI_MODEL_CONFIG_PATH || path.join(backendRoot, 'config', 'agent-model.json')
  const raw = await readFile(file, 'utf8')
  return schema.parse(JSON.parse(raw))
}
