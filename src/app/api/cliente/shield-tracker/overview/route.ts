import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildTrackingUrl } from '@/lib/ads-tracker/build-tracking-url'
import { defaultGoogleBlueprint } from '@/lib/ads-tracker/traffic-source-types'
import {
  mentoradoShieldPayBaseUrl,
  trackerOfferPostbackUrl,
} from '@/lib/ads-tracker/offer-urls'

const NICHE_OPTIONS = ['SAUDE', 'FINANCEIRO', 'BLACK', 'ECOMMERCE', 'EDUCACAO', 'GERAL'] as const

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const access = await prisma.clientMentoradoUniAccess.findMany({
    where: { clientId: client.id },
    select: { uniId: true },
  })
  const uniIds = access.map((a) => a.uniId)

  const unis =
    uniIds.length === 0
      ? []
      : await prisma.vaultIndustrialUnit.findMany({
          where: { id: { in: uniIds } },
          select: {
            id: true,
            displayName: true,
            primaryDomainHost: true,
            riskLevel: true,
          },
          orderBy: { createdAt: 'asc' },
        })

  const since = new Date(Date.now() - 24 * 3600 * 1000)
  const [allowed, blocked] =
    uniIds.length === 0
      ? [0, 0]
      : await Promise.all([
          prisma.trafficShieldAccessLog.count({
            where: { uniId: { in: uniIds }, createdAt: { gte: since }, verdict: 'ALLOWED' },
          }),
          prisma.trafficShieldAccessLog.count({
            where: { uniId: { in: uniIds }, createdAt: { gte: since }, verdict: 'BLOCKED' },
          }),
        ])

  const links = await prisma.mentoradoShieldTrackerLink.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: 'desc' },
    include: {
      uni: { select: { id: true, displayName: true, primaryDomainHost: true } },
      offer: {
        select: {
          id: true,
          name: true,
          platform: true,
          status: true,
          paySlug: true,
          postbackPublicToken: true,
          checkoutTargetUrl: true,
        },
      },
    },
  })

  const blueprint = defaultGoogleBlueprint()
  const items = links.map((row) => {
    const payBase =
      mentoradoShieldPayBaseUrl({
        paySlug: row.offer.paySlug,
        uniPrimaryHost: row.uni.primaryDomainHost,
        shieldProfile: row.shieldProfile,
        protectionNiche: row.protectionNiche,
      }) || ''
    const adsPack = payBase ? buildTrackingUrl(payBase, blueprint, {}, {}) : null
    const postbackBase = trackerOfferPostbackUrl(row.offer.postbackPublicToken)
    return {
      id: row.id,
      label: row.label,
      destinationUrl: row.destinationUrl,
      protectionNiche: row.protectionNiche,
      shieldProfile: row.shieldProfile,
      uni: row.uni,
      offer: {
        id: row.offer.id,
        name: row.offer.name,
        platform: row.offer.platform,
        status: row.offer.status,
        paySlug: row.offer.paySlug,
      },
      shieldPayUrl: payBase || null,
      adsFinalUrl: adsPack?.url || null,
      adsWarnings: adsPack?.warnings || [],
      postbackUrl: postbackBase,
    }
  })

  return NextResponse.json({
    unis,
    links: items,
    shieldStats24h: { allowed, blocked, windowHours: 24 },
    nicheOptions: NICHE_OPTIONS,
    profileOptions: [
      { value: 'SAFE', label: 'Página de destino segura (Safe Page)', hint: 'Tráfego sensível / pré-pagamento' },
      { value: 'MONEY', label: 'Página de oferta (checkout / VSL monetária)', hint: 'Compradores qualificados' },
    ],
    checkoutPlatforms: [
      { id: 'KIWIFY', label: 'Kiwify', postbackQuery: '' },
      { id: 'HOTMART', label: 'Hotmart', postbackQuery: '' },
      { id: 'EDUZZ', label: 'Eduzz', postbackQuery: '' },
      { id: 'KIRVANO', label: 'Kirvano', postbackQuery: '' },
      { id: 'PERFECT_PAY', label: 'Perfect Pay', postbackQuery: '' },
      { id: 'OTHER', label: 'Outra / genérica', postbackQuery: '' },
    ],
    trackingNote:
      'O Google Ads acrescenta o gclid automaticamente (auto-tagging). A URL final inclui {campaignid}, {adgroupid} e outros ValueTrack para alimentar o Módulo 03.',
  })
}
