/**
 * Registro de ativos únicos — impede reutilização (CPF, CNPJ, RG, Email, Google Ads ID, etc.)
 * Nenhum documento/ativo pode ser reutilizado sob hipótese alguma.
 */
import { createHash } from 'crypto'
import { prisma } from './prisma'

export type UniqueAssetType =
  | 'CPF'
  | 'CNPJ'
  | 'RG_HASH'
  | 'EMAIL_GOOGLE'
  | 'RECOVERY_EMAIL'
  | 'GOOGLE_ADS_ID'
  | 'PAYMENT_PROFILE'
  | 'PHONE'

function normalizeForHash(type: UniqueAssetType, value: string): string {
  const v = value.trim().toLowerCase()
  if (type === 'PAYMENT_PROFILE' || type === 'RG_HASH') return v  // IDs e hashes: usar como está
  return v.replace(/\s/g, '').replace(/\D/g, '')  // CPF, CNPJ, etc: só dígitos
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Gera hash único para o ativo */
export function hashAsset(type: UniqueAssetType, value: string): string {
  if (!value || typeof value !== 'string') return ''
  const normalized = normalizeForHash(type, value)
  if (!normalized && type !== 'PAYMENT_PROFILE') return ''
  return sha256(`${type}:${normalized}`)
}

/** Verifica se o ativo já foi consumido (reutilização bloqueada) */
export async function isAssetConsumed(
  type: UniqueAssetType,
  value: string,
  excludeProductionG2Id?: string,
  excludeProductionAccountId?: string
): Promise<boolean> {
  const h = hashAsset(type, value)
  if (!h) return false

  const reg = await prisma.uniqueAssetRegistry.findUnique({
    where: { assetType_assetHash: { assetType: type, assetHash: h } },
  })
  if (!reg) return false
  if (excludeProductionG2Id && reg.productionG2Id === excludeProductionG2Id) return false
  if (excludeProductionAccountId && reg.productionAccountId === excludeProductionAccountId) return false
  return true
}

/** Registra ativo como consumido (não reutilizável). Falha se já consumido. */
export async function registerAssetConsumed(
  type: UniqueAssetType,
  value: string,
  productionG2Id?: string,
  productionAccountId?: string
): Promise<{ ok: boolean; error?: string }> {
  const h = hashAsset(type, value)
  if (!h) return { ok: false, error: 'Valor inválido para hash' }

  const existing = await prisma.uniqueAssetRegistry.findUnique({
    where: { assetType_assetHash: { assetType: type, assetHash: h } },
  })
  if (existing) {
    return { ok: false, error: 'Ativo já foi consumido em outra conta (reutilização bloqueada)' }
  }

  try {
    await prisma.uniqueAssetRegistry.create({
      data: {
        assetType: type,
        assetHash: h,
        productionG2Id: productionG2Id || null,
        productionAccountId: productionAccountId || null,
      },
    })
    return { ok: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao registrar'
    return { ok: false, error: msg }
  }
}

/** Normaliza CNPJ para hash */
export function normalizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, '').slice(0, 14)
}

/** Normaliza CPF para hash */
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '').slice(0, 11)
}

/** Normaliza Google Ads ID */
export function normalizeGoogleAdsId(id: string): string {
  return id.replace(/\D/g, '').slice(0, 12)
}
