export type ParsedVaultGmailLine = {
  email: string
  password: string
  recoveryEmail?: string
  twoFa?: string
  /** Objeto ou array (EditThisCookie). */
  cookies?: unknown
}

function tryParseCookiesJson(raw: string): unknown {
  const t = raw.trim()
  if (!t || (t[0] !== '{' && t[0] !== '[')) return undefined
  try {
    const v = JSON.parse(t) as unknown
    if (v && typeof v === 'object') return v
  } catch {
    return undefined
  }
  return undefined
}

/**
 * Formatos suportados:
 * - email:password
 * - email:password:email_recuperacao
 * - email<TAB>password<TAB>[2fa]<TAB>[json cookies objeto ou array]
 */
export function parseVaultGmailLine(line: string): ParsedVaultGmailLine | null {
  const t = line.trim()
  if (!t || t.startsWith('#')) return null

  if (t.includes('\t')) {
    const parts = t.split(/\t/).map((p) => p.trim())
    const email = parts[0]
    const password = parts[1]
    if (!email || !password) return null
    const twoFa = parts[2] || undefined
    let cookies: unknown
    if (parts[3]) {
      cookies = tryParseCookiesJson(parts[3])
    }
    return { email, password, twoFa, cookies }
  }

  const firstColon = t.indexOf(':')
  const lastColon = t.lastIndexOf(':')
  if (firstColon <= 0) return null

  if (firstColon !== lastColon) {
    const email = t.slice(0, firstColon).trim()
    const password = t.slice(firstColon + 1, lastColon).trim()
    const recovery = t.slice(lastColon + 1).trim()
    if (email.includes('@') && password && recovery) {
      return { email, password, recoveryEmail: recovery }
    }
  }

  const email = t.slice(0, firstColon).trim()
  const password = t.slice(firstColon + 1).trim()
  if (!email || !password) return null
  return { email, password }
}
