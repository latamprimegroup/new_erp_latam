import type { Cnpj, Email, ProductionAccount } from '@prisma/client'

type Minimal = Pick<
  ProductionAccount,
  'email' | 'cnpj' | 'siteUrl'
> & {
  cnpjConsumed?: Pick<Cnpj, 'cnpj' | 'razaoSocial' | 'nomeFantasia'> | null
  emailConsumed?: Pick<Email, 'email'> | null
}

/**
 * Texto de rodapé para paridade com faturamento Google (CNPJ, razão, endereço quando houver, e-mail).
 */
export function buildProductionFooterText(account: Minimal): string {
  const email =
    account.emailConsumed?.email?.trim() ||
    account.email?.trim() ||
    ''
  const cnpjDigits = (account.cnpjConsumed?.cnpj || account.cnpj || '').replace(/\D/g, '')
  const cnpjFmt =
    cnpjDigits.length === 14
      ? `${cnpjDigits.slice(0, 2)}.${cnpjDigits.slice(2, 5)}.${cnpjDigits.slice(5, 8)}/${cnpjDigits.slice(8, 12)}-${cnpjDigits.slice(12)}`
      : account.cnpjConsumed?.cnpj || account.cnpj || ''
  const razao =
    account.cnpjConsumed?.razaoSocial?.trim() ||
    account.cnpjConsumed?.nomeFantasia?.trim() ||
    ''
  const lines: string[] = []
  if (razao) lines.push(razao)
  if (cnpjFmt) lines.push(`CNPJ: ${cnpjFmt}`)
  if (email) lines.push(email)
  if (account.siteUrl?.trim()) lines.push(account.siteUrl.trim())
  return lines.join('\n')
}
