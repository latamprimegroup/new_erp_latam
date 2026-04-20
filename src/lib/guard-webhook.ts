import { createHash } from 'node:crypto'

export async function postGuardWebhook(
  payload: Record<string, unknown>,
  webhookUrlOverride?: string | null,
): Promise<void> {
  const url = (webhookUrlOverride || process.env.GUARD_NOTIFICATION_WEBHOOK || '').trim()
  if (!url) return
  const secret = process.env.GUARD_WEBHOOK_SECRET?.trim()
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'AdsAtivosGuard/1.0',
  }
  if (secret) {
    const sig = createHash('sha256').update(body + secret).digest('hex')
    headers['X-Guard-Signature'] = sig
  }
  await fetch(url, { method: 'POST', headers, body }).catch(() => {})
}
