/**
 * War Room — mentorado (Módulo 01): KPIs, UNIs autorizadas, feed, ping de contingência.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import {
  AccountPlatform,
  AccountStatus,
  TrackerSalePaymentState,
  VaultIndustrialUnitStatus,
} from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { maskCnpj, maskEmail } from '@/lib/gatekeeper/masking'
import { maskAdsPowerProfileId, maskProxyHostKey } from '@/lib/mentorado/mask-proxy'
import { proxyHostKeyFromParts } from '@/lib/ads-tracker/urls'

const PING_KEY = 'mentorado_contingency_ping'

function uniReadiness(status: VaultIndustrialUnitStatus): { ready: boolean; label: string } {
  switch (status) {
    case VaultIndustrialUnitStatus.READY_FOR_WARMUP:
      return { ready: true, label: 'Pronta para operar' }
    case VaultIndustrialUnitStatus.PROVISIONING:
      return { ready: false, label: 'Em provisionamento' }
    case VaultIndustrialUnitStatus.FAILED:
      return { ready: false, label: 'Requer atenção da equipa' }
    default:
      return { ready: false, label: 'Em configuração' }
  }
}

function fingerprintLabel(uni: {
  preferredLocale: string | null
  timezoneIana: string | null
  adsPowerProfileId: string | null
}): string {
  const loc = uni.preferredLocale || 'pt-BR'
  const tz = uni.timezoneIana || 'America/Sao_Paulo'
  const ap = maskAdsPowerProfileId(uni.adsPowerProfileId)
  return `Chrome (isolado) · Windows 11 (simulado) · ${loc} · ${tz}${ap ? ` · AdsPower ${ap}` : ''}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: {
      id: true,
      operationNiche: true,
      trustLevelStars: true,
      widgetNiche: true,
    },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const [accessRows, googleAdsAssets, roiAgg, pingRow] = await Promise.all([
    prisma.clientMentoradoUniAccess.findMany({
      where: { clientId: client.id },
      select: { uniId: true },
    }),
    prisma.stockAccount.count({
      where: {
        clientId: client.id,
        platform: AccountPlatform.GOOGLE_ADS,
        deletedAt: null,
        archivedAt: null,
        status: {
          in: [
            AccountStatus.DELIVERED,
            AccountStatus.IN_USE,
            AccountStatus.AVAILABLE,
            AccountStatus.APPROVED,
          ],
        },
      },
    }),
    prisma.trackerOfferSaleSignal.aggregate({
      where: {
        paymentState: TrackerSalePaymentState.APPROVED,
        countedForRevenue: true,
      },
      _avg: { amountGross: true },
    }),
    prisma.systemSetting.findUnique({ where: { key: PING_KEY } }),
  ])

  const uniIds = accessRows.map((a) => a.uniId)
  const unis =
    uniIds.length === 0
      ? []
      : await prisma.vaultIndustrialUnit.findMany({
          where: { id: { in: uniIds } },
          include: {
            inventoryGmail: { select: { email: true } },
            inventoryCnpj: { select: { cnpj: true } },
            matchedProxy: { select: { proxyHost: true, proxyPort: true, provider: true } },
          },
        })

  let contingencyPing: { at: string | null; ok: boolean | null; latencyMs: number | null } = {
    at: null,
    ok: null,
    latencyMs: null,
  }
  if (pingRow?.value) {
    try {
      const j = JSON.parse(pingRow.value) as {
        at?: string
        ok?: boolean
        latencyMs?: number | null
      }
      contingencyPing = {
        at: typeof j.at === 'string' ? j.at : null,
        ok: typeof j.ok === 'boolean' ? j.ok : null,
        latencyMs: typeof j.latencyMs === 'number' ? j.latencyMs : null,
      }
    } catch {
      /* ignore */
    }
  }

  const uniPayload = unis.map((u) => {
    const r = uniReadiness(u.status)
    const proxyKey = proxyHostKeyFromParts(u.matchedProxy?.proxyHost, u.matchedProxy?.proxyPort)
    return {
      id: u.id,
      displayName: u.displayName || 'Unidade operacional',
      status: u.status,
      readiness: r,
      primaryDomainHost: u.primaryDomainHost,
      proxyMasked: maskProxyHostKey(proxyKey),
      proxyProvider: u.matchedProxy?.provider ?? null,
      fingerprint: fingerprintLabel(u),
      gmailMasked: maskEmail(u.inventoryGmail.email),
      cnpjMasked: maskCnpj(u.inventoryCnpj.cnpj),
      lastProxyProbeOk: u.lastProxyProbeOk,
      killedAt: u.killedAt?.toISOString() ?? null,
    }
  })

  const anyUniReady = uniPayload.some((u) => u.readiness.ready && !u.killedAt)
  const allUnisKilled = uniPayload.length > 0 && uniPayload.every((u) => u.killedAt)

  const eliteFeed = [
    {
      id: 'feed-1',
      kind: 'creative' as const,
      title: 'Novo criativo validado adicionado ao nicho Nutra',
      detail: 'Biblioteca interna atualizada — alinhe a copy à política Google antes de escalar.',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'feed-2',
      kind: 'shield' as const,
      title: 'Google Ads: padrão de revisão em atualização',
      detail: 'Traffic Shield sincronizado com novas heurísticas de ambiente. Mantenha gclid nos links.',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'feed-3',
      kind: 'ops' as const,
      title: 'Protocolo 15 minutos',
      detail: 'Use o assistente na War Room para não saltar passos críticos de identidade.',
      createdAt: new Date().toISOString(),
    },
  ]

  const roiAvg = roiAgg._avg.amountGross

  return NextResponse.json({
    client: {
      id: client.id,
      trustLevelStars: client.trustLevelStars,
      operationNiche: client.operationNiche,
      widgetNiche: client.widgetNiche,
    },
    kpis: {
      uniSummary: {
        assigned: uniPayload.length,
        ready: anyUniReady,
        allKilled: allUnisKilled,
        label:
          uniPayload.length === 0
            ? 'Sem UNI atribuída'
            : anyUniReady
              ? 'Ambiente operacional ativo'
              : allUnisKilled
                ? 'UNI em isolamento (kill-switch)'
                : 'Ambiente em preparação',
      },
      googleAdsAssets: googleAdsAssets,
      ecosystemRoiAvgBrl: roiAvg ? Number(roiAvg.toFixed(2)) : null,
    },
    unis: uniPayload,
    contingencyPing,
    eliteFeed,
  })
}
