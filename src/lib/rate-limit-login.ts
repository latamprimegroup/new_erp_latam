/**
 * Rate limit para login (brute force protection)
 * Edge-compatible: sem setInterval, cleanup lazy
 */
const store = new Map<string, { count: number; resetAt: number }>()
const MAX_ENTRIES = 10_000

function cleanup() {
  if (store.size < MAX_ENTRIES) return
  const now = Date.now()
  for (const [key, val] of Array.from(store.entries())) {
    if (val.resetAt < now) store.delete(key)
  }
}

export function checkLoginRateLimit(ip: string): { success: boolean } {
  const key = `login:${ip}`
  const windowMs = 60_000 // 1 min
  const max = 5
  const now = Date.now()

  cleanup()

  const entry = store.get(key)

  if (!entry) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true }
  }

  if (entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true }
  }

  entry.count++
  return { success: entry.count <= max }
}
