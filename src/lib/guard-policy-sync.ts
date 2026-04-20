/**
 * Compara texto da política Google Ads entre execuções (cron semanal).
 */
export function textChangePercent(prev: string, next: string): number {
  const a = prev.trim()
  const b = next.trim()
  if (!a && !b) return 0
  if (!a || !b) return 100
  const m = a.length
  const n = b.length
  const maxLen = Math.max(m, n)
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i]![0] = i
  for (let j = 0; j <= n; j++) dp[0]![j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      )
    }
  }
  const dist = dp[m]![n]!
  return Math.min(100, (dist / maxLen) * 100)
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const GOOGLE_ADS_DECEPTIVE_POLICY_URL =
  'https://support.google.com/google-ads/answer/6020955?hl=pt-BR'

export async function fetchPolicyPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'AdsAtivosGuardPolicyBot/1.0 (+compliance)',
      Accept: 'text/html,application/xhtml+xml',
    },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  return stripHtml(html).slice(0, 500_000)
}
