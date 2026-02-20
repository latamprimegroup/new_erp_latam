import { prisma } from './prisma'

/** Extrai o número do CNPJ a partir de um link (ex: Receita, Brasil API) */
export function extractCnpjFromLink(link: string): string {
  const digits = link.replace(/\D/g, '')
  if (digits.length >= 14) return digits.slice(0, 14)
  return digits
}

/** Formata CNPJ para exibição */
export function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) return cnpj
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** Gera próximo código G2 (ex: G2-00001) */
export async function generateCodeG2(): Promise<string> {
  const last = await prisma.productionG2.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { codeG2: true },
  })
  if (!last) return 'G2-00001'
  const num = parseInt(last.codeG2.replace(/^G2-0*/, '') || '0', 10) + 1
  return `G2-${String(num).padStart(5, '0')}`
}

/** Gera Item ID único (8 chars) */
export function generateItemId(): string {
  return `IT-${Date.now().toString(36).toUpperCase().slice(-6)}`
}

/** Valida duplicidade de CNPJ em contas ativas (não arquivadas) */
export async function isCnpjInUse(cnpjNumber: string, excludeId?: string): Promise<boolean> {
  const normalized = cnpjNumber.replace(/\D/g, '')
  if (normalized.length < 14) return false
  const where: { cnpjNumber: string; archivedAt: null; deletedAt: null; id?: { not: string } } = {
    cnpjNumber: normalized,
    archivedAt: null,
    deletedAt: null,
  }
  if (excludeId) where.id = { not: excludeId }
  const exists = await prisma.productionG2.findFirst({ where, select: { id: true } })
  return !!exists
}

/** Valida duplicidade de email Google em contas ativas */
export async function isEmailGoogleInUse(
  email: string,
  excludeId?: string
): Promise<boolean> {
  const em = email.toLowerCase().trim()
  const cred = await prisma.productionG2Credential.findFirst({
    where: { emailGoogle: em },
    include: { productionG2: { select: { id: true, archivedAt: true } } },
  })
  if (!cred || cred.productionG2.archivedAt) return false
  if (excludeId && cred.productionG2.id === excludeId) return false
  return true
}

/** Valida duplicidade de ID Google Ads em contas ativas */
export async function isGoogleAdsIdInUse(
  customerId: string,
  excludeId?: string
): Promise<boolean> {
  const normalized = customerId.replace(/\D/g, '')
  if (!normalized) return false
  const list = await prisma.productionG2.findMany({
    where: { archivedAt: null, deletedAt: null, googleAdsCustomerId: { not: null } },
    select: { id: true, googleAdsCustomerId: true },
  })
  const match = list.find(
    (r) => r.googleAdsCustomerId?.replace(/\D/g, '') === normalized
  )
  if (!match) return false
  return match.id !== excludeId
}

/** Mascara credencial para exibição */
export function maskCredential(value: string | null, visibleChars = 4): string {
  if (!value || value.length <= visibleChars) return '••••••••'
  return value.slice(-visibleChars).padStart(value.length, '•')
}
