import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import {
  ADS_CORE_DUPLICATE_MSG,
  ADS_CORE_URL_HISTORICO_MSG,
  normalizeAdsCoreCnpj,
  normalizeAdsCoreSiteUrl,
} from '@/lib/ads-core-utils'
import { isSiteUrlOnlyInHistory } from '@/lib/ads-core-url-footprint'
import { assertCnpjAvailableForNewAsset } from '@/lib/ads-core-cnpj-registry'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

function canUseCheck(role?: string) {
  return isGerente(role) || role === 'PRODUCER'
}

/**
 * Valida unicidade de site_url e/ou CNPJ em tempo real (footprint zero).
 * excludeAssetId: ignorar o próprio ativo na edição.
 */
export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!canUseCheck(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const siteUrlRaw = searchParams.get('siteUrl')
  const cnpjRaw = searchParams.get('cnpj')
  const excludeAssetId = searchParams.get('excludeAssetId')

  if (!siteUrlRaw && !cnpjRaw) {
    return NextResponse.json({ error: 'Informe siteUrl ou cnpj' }, { status: 400 })
  }

  if (cnpjRaw) {
    const cnpj = normalizeAdsCoreCnpj(cnpjRaw)
    if (cnpj.length === 14) {
      const row = await prisma.adsCoreAsset.findFirst({
        where: {
          cnpj,
          ...(excludeAssetId ? { id: { not: excludeAssetId } } : {}),
        },
        select: {
          id: true,
          producer: { select: { name: true, email: true } },
        },
      })
      if (row) {
        const who = row.producer
          ? (row.producer.name || row.producer.email || 'colaborador').trim()
          : null
        return NextResponse.json({
          available: false,
          field: 'cnpj',
          message: who
            ? `${ADS_CORE_DUPLICATE_MSG} (vinculado ao colaborador: ${who}).`
            : ADS_CORE_DUPLICATE_MSG,
        })
      }
      const reg = await assertCnpjAvailableForNewAsset(prisma, cnpj)
      if (reg.blocked) {
        return NextResponse.json({
          available: false,
          field: 'cnpj',
          message: reg.message,
          code: 'CNPJ_JA_PROCESSADO',
        })
      }
    }
  }

  if (siteUrlRaw && siteUrlRaw.trim()) {
    const norm = normalizeAdsCoreSiteUrl(siteUrlRaw)
    if (norm) {
      const row = await prisma.adsCoreAsset.findFirst({
        where: {
          siteUrl: norm,
          ...(excludeAssetId ? { id: { not: excludeAssetId } } : {}),
        },
        select: { id: true },
      })
      if (row) {
        return NextResponse.json({
          available: false,
          field: 'siteUrl',
          message: ADS_CORE_DUPLICATE_MSG,
        })
      }
      const inHistory = await isSiteUrlOnlyInHistory(prisma, norm, excludeAssetId ?? undefined)
      if (inHistory) {
        return NextResponse.json({
          available: false,
          field: 'siteUrl',
          message: ADS_CORE_URL_HISTORICO_MSG,
        })
      }
    }
  }

  return NextResponse.json({ available: true })
}
