import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { z } from 'zod'

export const userModelInputSchema = z.object({
  provider: z.enum(['openai-compatible', 'anthropic-compatible']),
  baseUrl: z.string().trim().min(1).max(500),
  model: z.string().trim().min(1).max(120).regex(/^[\w./:-]+$/),
  apiKey: z.string().trim().min(8).max(4096).regex(/^\S+$/).optional(),
}).strict()

const blocked = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10],
  ['ff00::', 8], ['2001:db8::', 32],
] as const) blocked.addSubnet(address, prefix, 'ipv6')

export function normalizeCustomBaseUrl(value: string) {
  const url = new URL(value.trim())
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash || (url.port && url.port !== '443')) throw new Error('Base URL 必须是无凭据、查询参数的公开 HTTPS 地址')
  const host = url.hostname.toLowerCase()
  if (isIP(host) || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) throw new Error('Base URL 不能指向本机或内部地址')
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`
}

export async function assertPublicBaseUrl(value: string) {
  const normalized = normalizeCustomBaseUrl(value)
  const host = new URL(normalized).hostname
  const addresses = await lookup(host, { all: true })
  if (!addresses.length || addresses.some(({ address, family }) => blocked.check(address, family === 4 ? 'ipv4' : 'ipv6'))) throw new Error('Base URL 解析到了非公开地址')
  return normalized
}

export function maskApiKey(last4: string) { return `sk-****${last4}` }
