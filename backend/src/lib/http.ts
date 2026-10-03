import type { FastifyReply, FastifyRequest } from 'fastify'
import { nanoid } from 'nanoid'

export function requestId(request: FastifyRequest) {
  return request.id || `req_${nanoid(14)}`
}

export function actorFrom(request: FastifyRequest) {
  const value = request.headers['x-user-id']
  return typeof value === 'string' && value.trim() ? value.trim() : 'dev-user'
}

export function ok<T>(request: FastifyRequest, data: T, extra: Record<string, unknown> = {}) {
  return { data, meta: { requestId: requestId(request), ...extra } }
}

export function fail(reply: FastifyReply, request: FastifyRequest, status: number, code: string, message: string, retryable = false) {
  return reply.status(status).send({ error: { code, message, retryable }, meta: { requestId: requestId(request) } })
}
