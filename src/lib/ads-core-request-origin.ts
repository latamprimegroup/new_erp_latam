/** Origem pública da aplicação (links assinados internos). */
export function resolveAppOrigin(req: Request): string {
  const e = process.env.NEXTAUTH_URL
  if (e) return e.replace(/\/$/, '')
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`
  const u = new URL(req.url)
  return `${u.protocol}//${u.host}`
}
