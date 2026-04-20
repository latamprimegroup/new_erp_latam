import type { StockAccount, StockAccountCredential } from '@prisma/client'

export type TechnicalBadge = {
  key: string
  label: string
  variant: 'neutral' | 'ok' | 'warn' | 'bad'
}

/**
 * Heurísticas para badges de status técnico (ofertas de gestor).
 * Sem colunas dedicadas no schema — evoluir para campos explícitos se necessário.
 */
export function technicalBadgesForOffer(
  account: Pick<StockAccount, 'status'> & {
    credential?: Pick<
      StockAccountCredential,
      'email' | 'passwordEncrypted' | 'twoFaSecret' | 'proxyConfig' | 'notes'
    > | null
  }
): TechnicalBadge[] {
  const cred = account.credential
  const hasLogin =
    !!(cred?.email?.trim() || cred?.passwordEncrypted?.trim())
  const hasCookie =
    cred?.proxyConfig != null &&
    (typeof cred.proxyConfig === 'object'
      ? Object.keys(cred.proxyConfig as object).length > 0
      : String(cred.proxyConfig).trim().length > 0)
  const has2fa = !!cred?.twoFaSecret?.trim()

  const badges: TechnicalBadge[] = []

  if (!hasLogin) {
    badges.push({ key: 'await_login', label: 'Aguardando Login', variant: 'warn' })
  } else {
    badges.push({ key: 'login_ok', label: 'Login OK', variant: 'ok' })
  }

  if (hasCookie) {
    badges.push({ key: 'cookie_ok', label: 'Cookie OK', variant: 'ok' })
  } else {
    badges.push({ key: 'no_cookie', label: 'Sem cookie JSON', variant: 'neutral' })
  }

  if (!has2fa) {
    badges.push({ key: 'no_2fa', label: 'Sem 2FA', variant: 'warn' })
  } else {
    badges.push({ key: '2fa_ok', label: '2FA cadastrado', variant: 'ok' })
  }

  if (account.status === 'REJECTED') {
    badges.push({ key: 'blocked', label: 'Bloqueada', variant: 'bad' })
  }

  return badges
}

export function whatsappHref(contact: string | null | undefined): string | null {
  if (!contact?.trim()) return null
  const digits = contact.replace(/\D/g, '')
  if (digits.length < 10) return null
  return `https://wa.me/${digits}`
}
