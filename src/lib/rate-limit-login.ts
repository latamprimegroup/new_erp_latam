/**
 * Rate limit para login (brute force protection)
 * Edge-compatible: sem setInterval, cleanup lazy
 *
 * Em várias instâncias, prefira Redis (ver docs/DEPLOY-PRODUCAO.md).
 */
const store = new Map<string, { count: number; resetAt: number }>()
const MAX_ENTRIES = 10_000

/** Janela e limite (ajustáveis por env) */
function windowMs(): number {
  const n = parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_SEC || '900', 10)
  return Math.min(Math.max(n, 60), 3600) * 1000
}

function maxAttempts(): number {
  const n = parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '12', 10)
  return Math.min(Math.max(n, 3), 100)
}

function cleanup() {
  if (store.size < MAX_ENTRIES) return
  const now = Date.now()
  for (const [key, val] of Array.from(store.entries())) {
    if (val.resetAt < now) store.delete(key)
  }
}

export function checkLoginRateLimit(ip: string): {
  success: boolean
  retryAfterSeconds?: number
} {
  const key = `login:${ip}`
  const win = windowMs()
  const max = maxAttempts()
  const now = Date.now()

  cleanup()

  const entry = store.get(key)

  if (!entry) {
    store.set(key, { count: 1, resetAt: now + win })
    return { success: true }
  }

  if (entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + win })
    return { success: true }
  }

  entry.count++
  if (entry.count <= max) {
    return { success: true }
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
  return { success: false, retryAfterSeconds }
}
