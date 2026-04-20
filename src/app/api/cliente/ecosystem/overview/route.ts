/**
 * Visão consolidada: contas, domínios, landings, perfil (tracking global) — Infraestrutura de Guerra (cliente).
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildProfileStartUrl } from '@/lib/multilogin-adapter'

function warmUpFromDeliveredAt(deliveredAt: Date | null): {
  phase: 'PENDING' | 'WARMING' | 'READY'
  label: string
  day: number
  maxDays: number
} {
  const maxDays = 7
  if (!deliveredAt) {
    return { phase: 'PENDING', label: 'Aguardando entrega', day: 0, maxDays }
  }
  const elapsed = Date.now() - deliveredAt.getTime()
  const day = Math.min(maxDays, Math.max(1, Math.floor(elapsed / 86_400_000) + 1))
  if (day >= maxDays) {
    return { phase: 'READY', label: `Aquecimento concluído (${maxDays}/${maxDays} dias)`, day: maxDays, maxDays }
  }
  return { phase: 'WARMING', label: `AQUECENDO — ${day}/${maxDays} DIAS`, day, maxDays }
}

function proxyHealth(proxyConfig: unknown): 'green' | 'yellow' | 'red' {
  if (proxyConfig != null && typeof proxyConfig === 'object' && Object.keys(proxyConfig as object).length > 0) {
    return 'green'
  }
  return 'yellow'
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
      globalTrackingScript: true,
      complianceFooterDefault: true,
    },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const clientId = client.id

  const [accounts, domains, pages, briefings, deployments] = await Promise.all([
    prisma.stockAccount.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { deliveredAt: 'desc' },
      take: 80,
      select: {
        id: true,
        status: true,
        deliveredAt: true,
        googleAdsCustomerId: true,
        credential: {
          select: { email: true, proxyConfig: true },
        },
        productionAccount: {
          select: {
            email: true,
            siteUrl: true,
            proxyNote: true,
            proxyConfigured: true,
          },
        },
      },
    }),
    prisma.landingDomain.findMany({
      where: { clientId },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: {
        id: true,
        domain: true,
        sslStatus: true,
        updatedAt: true,
        deployments: {
          orderBy: { deployedAt: 'desc' },
          take: 3,
          select: {
            id: true,
            url: true,
            status: true,
            hospedaRef: true,
            deployedAt: true,
          },
        },
      },
    }),
    prisma.landingPage.findMany({
      where: { clientId },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: {
        id: true,
        status: true,
        templateMode: true,
        updatedAt: true,
        briefing: { select: { id: true, nomeEmpresa: true, nomeFantasia: true } },
      },
    }),
    prisma.landingBriefing.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        nomeEmpresa: true,
        cidade: true,
        estado: true,
        cnpj: true,
        templateMode: true,
        vturbEmbed: true,
        footerHtml: true,
        status: true,
      },
    }),
    prisma.landingDeployment.findMany({
      where: { page: { clientId } },
      orderBy: { deployedAt: 'desc' },
      take: 80,
      select: {
        pageId: true,
        url: true,
        status: true,
        hospedaRef: true,
        deployedAt: true,
        domain: { select: { domain: true, sslStatus: true } },
      },
    }),
  ])

  const deploymentByPageId = new Map<string, (typeof deployments)[0]>()
  for (const d of deployments) {
    if (!deploymentByPageId.has(d.pageId)) deploymentByPageId.set(d.pageId, d)
  }

  const operationCards = accounts.map((a) => {
    const login =
      a.credential?.email ||
      a.productionAccount?.email ||
      null
    const landerUrl = a.productionAccount?.siteUrl || null
    const warm = warmUpFromDeliveredAt(a.deliveredAt)
    const proxy = proxyHealth(a.credential?.proxyConfig)
    const multiloginHint =
      a.productionAccount?.proxyNote?.includes('AdsPower') || a.productionAccount?.proxyNote?.includes('Dolphin')
        ? a.productionAccount.proxyNote
        : null

    return {
      accountId: a.id,
      status: a.status,
      googleAdsCustomerId: a.googleAdsCustomerId,
      loginGoogle: login,
      proxyHealth: proxy,
      proxyNote: a.productionAccount?.proxyNote ?? null,
      landerUrl,
      multiloginHint,
      warmUp: warm,
    }
  })

  const consolidatedRows = pages.map((p) => {
    const dep = deploymentByPageId.get(p.id)
    return {
      pageId: p.id,
      briefingLabel: p.briefing?.nomeFantasia || p.briefing?.nomeEmpresa || 'Briefing',
      pageStatus: p.status,
      templateMode: p.templateMode,
      domain: dep?.domain?.domain ?? '—',
      ssl: dep?.domain?.sslStatus ?? '—',
      hosting: dep?.hospedaRef ?? dep?.status ?? '—',
      landingUrl: dep?.url ?? '—',
      updatedAt: p.updatedAt.toISOString(),
    }
  })

  const domainExpiryHealth = (ssl: string): 'green' | 'yellow' | 'red' => {
    const u = ssl.toUpperCase()
    if (u === 'ACTIVE' || u === 'LIVE' || u === 'OK') return 'green'
    if (u === 'PENDING' || u === 'PENDING_VALIDATION') return 'yellow'
    return 'red'
  }

  return NextResponse.json({
    profile: {
      globalTrackingScript: client.globalTrackingScript,
      complianceFooterDefault: client.complianceFooterDefault,
    },
    multilogin: {
      adsPowerStartUrlTemplate: buildProfileStartUrl('ads_power', '__PROFILE_ID__'),
      dolphinStartUrlTemplate: buildProfileStartUrl('dolphin', '__PROFILE_ID__'),
    },
    operationCards,
    domains: domains.map((d) => ({
      id: d.id,
      domain: d.domain,
      sslStatus: d.sslStatus,
      sslHealth: domainExpiryHealth(d.sslStatus),
      deployments: d.deployments,
    })),
    landingPages: pages,
    briefings,
    consolidatedRows,
    vccHub: {
      message: 'Cartões virtuais por bloco — configure com o financeiro; reserva de VCC em roadmap.',
    },
    whmFootprint: {
      message: 'NS rotativos e IP isolado via WHM/cPanel: operação de infraestrutura; vincule ao domínio no provisioning.',
    },
  })
}
