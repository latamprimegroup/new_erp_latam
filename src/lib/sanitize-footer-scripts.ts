/**
 * Sanitização leve de HTML de rodapé (admin): reduz XSS mantendo scripts externos de CDNs conhecidos.
 */
const MAX_LEN = 80_000

export function sanitizeFooterCustomHtml(input: string): string {
  if (!input || typeof input !== 'string') return ''
  let s = input.slice(0, MAX_LEN)
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  s = s.replace(/javascript:/gi, '')
  s = s.replace(/data:text\/html/gi, '')
  s = s.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // Remove scripts inline sem src (maior risco)
  s = s.replace(/<script(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/gi, '')
  return s.trim()
}
