import { prisma } from '@/lib/prisma'
import { createHash } from 'crypto'
import { gatekeeperAudit } from './audit-log'
import { GatekeeperBlockedError, GATEKEEPER_CROSSING_ERROR } from './errors'
import { maskCnpj, maskCpf, maskEmail } from './masking'

export function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase()
}

export function normalizePanForHash(pan: string): string {
  return pan.replace(/\D/g, '')
}

export function cardPanFingerprint(panDigits: string): string {
  return createHash('sha256').update(panDigits, 'utf8').digest('hex')
}

export async function assertGmailVaultUnique(emailKey: string): Promise<void> {
  const [vault, legacy] = await Promise.all([
    prisma.inventoryGmail.findUnique({ where: { email: emailKey } }),
    prisma.email.findUnique({ where: { email: emailKey } }),
  ])
  if (vault || legacy) {
    gatekeeperAudit('UNIQUENESS', `E-mail bloqueado (cofre ou legado): ${maskEmail(emailKey)}`)
    throw new GatekeeperBlockedError(GATEKEEPER_CROSSING_ERROR)
  }
}

export async function assertCnpjVaultUnique(cnpjDigits: string): Promise<void> {
  const [vault, legacy] = await Promise.all([
    prisma.inventoryCnpj.findUnique({ where: { cnpj: cnpjDigits } }),
    prisma.cnpj.findUnique({ where: { cnpj: cnpjDigits } }),
  ])
  if (vault || legacy) {
    gatekeeperAudit('UNIQUENESS', `CNPJ bloqueado (cofre ou legado): ${maskCnpj(cnpjDigits)}`)
    throw new GatekeeperBlockedError(GATEKEEPER_CROSSING_ERROR)
  }
}

export async function assertCpfVaultUnique(cpfDigits: string): Promise<void> {
  const row = await prisma.inventoryId.findUnique({ where: { cpf: cpfDigits } })
  if (row) {
    gatekeeperAudit('UNIQUENESS', `CPF bloqueado (cofre): ${maskCpf(cpfDigits)}`)
    throw new GatekeeperBlockedError(GATEKEEPER_CROSSING_ERROR)
  }
}

export async function assertPhotoHashUnique(photoHash: string): Promise<void> {
  const row = await prisma.inventoryId.findUnique({ where: { photoHash } })
  if (row) {
    gatekeeperAudit('UNIQUENESS', `photo_hash MD5 bloqueado (reuso de documento): ${photoHash.slice(0, 8)}…`)
    throw new GatekeeperBlockedError(GATEKEEPER_CROSSING_ERROR)
  }
}

export async function assertCardPanUnique(panHash: string): Promise<void> {
  const row = await prisma.inventoryCard.findUnique({ where: { cardPanHash: panHash } })
  if (row) {
    gatekeeperAudit('UNIQUENESS', 'PAN bloqueado (hash SHA-256 já existente no cofre)')
    throw new GatekeeperBlockedError(GATEKEEPER_CROSSING_ERROR)
  }
}
