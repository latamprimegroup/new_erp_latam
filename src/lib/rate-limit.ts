/**
 * Rate limiting em memória (para desenvolvimento e baixo volume)
 * Em produção com múltiplas instâncias, use Redis (ex: @upstash/ratelimit)
 */
const store = new Map<string, { count: number; resetAt: number }>()
const CLEANUP_INTERVAL = 60_000

setInterval(() => {
  const now = Date.now()
  for (const [key, val] of store.entries()) {
    if (val.resetAt < now) store.delete(key)
  }
}, CLEANUP_INTERVAL)

export type RateLimitConfig = {
  windowMs: number
  max: number
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  max: 60,
}

export function checkRateLimit(
  identifier: string,
  config: Partial<RateLimitConfig> = {}
): { success: boolean; remaining: number; resetAt: number } {
  const { windowMs, max } = { ...DEFAULT_CONFIG, ...config }
  const now = Date.now()
  const key = identifier
  const entry = store.get(key)

  if (!entry) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: max - 1, resetAt: now + windowMs }
  }

  if (entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: max - 1, resetAt: now + windowMs }
  }

  entry.count++
  const remaining = Math.max(0, max - entry.count)
  const success = entry.count <= max

  return {
    success,
    remaining,
    resetAt: entry.resetAt,
  }
}
