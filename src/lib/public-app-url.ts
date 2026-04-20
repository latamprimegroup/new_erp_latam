/** URL pública da app (links em mensagens de bot / WhatsApp). */
export function getPublicAppBaseUrl(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (u) return u
  const v = process.env.VERCEL_URL?.trim().replace(/\/$/, '')
  if (v) return v.startsWith('http') ? v : `https://${v}`
  return ''
}
