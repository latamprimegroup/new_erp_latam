/**
 * Valida export de cookies de sessão Google (ex.: EditThisCookie — array de { name, value }).
 * Exige SID + HSID quando há payload de cookies, para evitar JSON inválido no cofre.
 */

function namesFromCookieArray(arr: unknown[]): Set<string> {
  const names = new Set<string>()
  for (const item of arr) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const n = (item as { name?: unknown }).name
    if (typeof n === 'string' && n.trim()) {
      names.add(n.trim().toUpperCase())
    }
  }
  return names
}

function namesFromCookieRecord(obj: Record<string, unknown>): Set<string> {
  const names = new Set<string>()
  for (const k of Object.keys(obj)) {
    if (k.trim()) names.add(k.trim().toUpperCase())
  }
  return names
}

export type CookieSessionValidation = { ok: true } | { ok: false; error: string }

/**
 * `parsed` vem de JSON.parse — objeto ou array (EditThisCookie).
 * `undefined`/null/vazio → ok (cookies opcionais).
 */
export function validateGoogleSessionCookieJson(parsed: unknown): CookieSessionValidation {
  if (parsed === undefined || parsed === null) return { ok: true }

  if (typeof parsed === 'string') {
    const t = parsed.trim()
    if (!t) return { ok: true }
    return { ok: false, error: 'Cookies de sessão devem ser JSON objeto ou array, não string solta' }
  }

  let names: Set<string>
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return { ok: true }
    names = namesFromCookieArray(parsed)
  } else if (parsed && typeof parsed === 'object') {
    names = namesFromCookieRecord(parsed as Record<string, unknown>)
    if (names.size === 0) return { ok: true }
  } else {
    return { ok: false, error: 'Formato de cookies inválido' }
  }

  const hasSid = names.has('SID')
  const hasHsid = names.has('HSID')
  if (!hasSid || !hasHsid) {
    return {
      ok: false,
      error:
        'Cookies de sessão Google incompletos: é necessário incluir pelo menos os nomes SID e HSID (export típico .google.com).',
    }
  }

  return { ok: true }
}
