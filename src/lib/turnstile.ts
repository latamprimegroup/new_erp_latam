/**
 * Cloudflare Turnstile (CAPTCHA “invisível”) — verificação server-side.
 * Site key: NEXT_PUBLIC_TURNSTILE_SITE_KEY (cliente)
 * Secret: TURNSTILE_SECRET_KEY (servidor)
 */
export async function verifyTurnstileToken(token: string | undefined | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret) return true

  const t = token?.trim()
  if (!t) return false

  const body = new URLSearchParams()
  body.set('secret', secret)
  body.set('response', t)

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const j = (await res.json()) as { success?: boolean }
    return j.success === true
  } catch {
    return false
  }
}
