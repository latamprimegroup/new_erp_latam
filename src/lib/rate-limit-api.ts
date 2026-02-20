import { NextResponse } from 'next/server'
import { checkRateLimit } from './rate-limit'

export function getClientIdentifier(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  const realIp = req.headers.get('x-real-ip')
  const ip = forwarded?.split(',')[0]?.trim() || realIp || 'unknown'
  return ip
}

/** Chave para rate limit de APIs autenticadas (por usuário) */
export function getAuthenticatedKey(userId: string, action: string): string {
  return `auth:${userId}:${action}`
}

export function withRateLimit(
  req: Request,
  identifier: string,
  config?: { windowMs?: number; max?: number }
): NextResponse | null {
  const result = checkRateLimit(identifier, config)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': String(result.remaining),
        },
      }
    )
  }
  return null
}
