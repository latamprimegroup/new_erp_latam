/**
 * Gerador de IDs Exclusivos Ads Ativos
 * Formato: AA-CONT-000001
 *
 * Usa uma tabela `asset_counters` para garantir sequência atômica.
 * Nunca expõe o vendor_id ou dados internos no ID gerado.
 */
import { prisma } from '@/lib/prisma'
import type { AssetCategory } from '@prisma/client'

const CATEGORY_PREFIX: Record<AssetCategory, string> = {
  CONTAS:   'CONT',
  PERFIS:   'PERF',
  BM:       'BM',
  PROXIES:  'PROX',
  SOFTWARE: 'SOFT',
  INFRA:    'INFR',
  HARDWARE: 'HW',
  OUTROS:   'OUT',
}

/**
 * Gera e reserva atomicamente o próximo ID Ads Ativos para a categoria.
 * Usa upsert + increment para ser seguro em múltiplas requisições simultâneas.
 */
export async function generateAdsId(category: AssetCategory): Promise<string> {
  const prefix = CATEGORY_PREFIX[category] ?? 'OUT'

  const counter = await prisma.assetCounter.upsert({
    where:  { category: prefix },
    create: { category: prefix, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  })

  const seq = String(counter.lastSeq).padStart(6, '0')
  return `AA-${prefix}-${seq}`
}

/**
 * Parse do ID Ads Ativos para extrair categoria e sequência.
 */
export function parseAdsId(adsId: string): { prefix: string; seq: number } | null {
  const m = adsId.match(/^AA-([A-Z]+)-(\d+)$/)
  if (!m) return null
  return { prefix: m[1], seq: parseInt(m[2], 10) }
}
