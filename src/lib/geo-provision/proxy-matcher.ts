import type { GeoProxyPoolEntry } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type GeoProxyMatchLevel = 'city' | 'state' | 'ddd'

export type MatchedGeoProxy = {
  entry: GeoProxyPoolEntry
  /** True = proxy no estado / DDD, não na cidade exata — protocolo de transição 48h. */
  geoTransition: boolean
  matchLevel: GeoProxyMatchLevel
}

function normCity(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/**
 * Seleciona proxy do pool: cidade → DDD (quando âncora tem telefone com DDD) → UF.
 */
export async function matchGeoProxy(input: {
  anchorCity: string | null | undefined
  anchorStateUf: string | null | undefined
  anchorDdd?: string | null | undefined
}): Promise<MatchedGeoProxy> {
  const uf = (input.anchorStateUf || '').toUpperCase().slice(0, 2)
  const ddd = (input.anchorDdd || '').replace(/\D/g, '').slice(0, 2)
  const cityNorm = normCity(input.anchorCity || null)

  const all = await prisma.geoProxyPoolEntry.findMany({ where: { active: true } })
  if (all.length === 0) {
    throw new Error('Pool de proxies vazio. Cadastre entradas em /api/admin/geo-provision/proxies.')
  }

  if (cityNorm.length > 0) {
    const hit = all.find((p) => normCity(p.city) === cityNorm)
    if (hit) {
      return { entry: hit, geoTransition: false, matchLevel: 'city' }
    }
  }

  if (ddd.length >= 2) {
    const byDdd = all.find((p) => (p.ddd || '').replace(/\D/g, '').slice(0, 2) === ddd)
    if (byDdd) {
      return { entry: byDdd, geoTransition: true, matchLevel: 'ddd' }
    }
  }

  if (uf.length === 2) {
    const st = all.find((p) => (p.stateUf || '').toUpperCase() === uf)
    if (st) {
      return { entry: st, geoTransition: true, matchLevel: 'state' }
    }
  }

  throw new Error(
    'Sem proxy disponível para a âncora fiscal (cidade/DDD/UF). Ajuste o pool ou o endereço do CNPJ.'
  )
}
