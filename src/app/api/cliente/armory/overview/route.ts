import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { warmUpFromDeliveredAt } from '@/lib/cliente/warmup-phase'
import { maskProxyHostKey } from '@/lib/mentorado/mask-proxy'
import { proxyHostKeyFromParts } from '@/lib/ads-tracker/urls'
import { buildProfileStartUrl, multiloginClientInstructions } from '@/lib/multilogin-adapter'

function parseWarmupLog(json: unknown): { t: string; msg: string }[] {
  if (!Array.isArray(json)) return []
  const out: { t: string; msg: string }[] = []
  for (const x of json) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const t = typeof o.t === 'string' ? o.t : typeof o.at === 'string' ? o.at : ''
    const msg = typeof o.msg === 'string' ? o.msg : typeof o.message === 'string' ? o.message : ''
    if (!msg) continue
    out.push({ t: t || '', msg })
  }
  return out
}

function fingerprintSyncNote(uni: {
  anchorCity: string | null
  anchorState: string | null
  matchedProxy: { city: string | null; stateUf: string | null } | null
}): string {
  const anchor = [uni.anchorCity, uni.anchorState].filter(Boolean).join(', ')
  const proxyLoc = [uni.matchedProxy?.city, uni.matchedProxy?.stateUf].filter(Boolean).join(', ')
  if (anchor && proxyLoc) {
    return `Âncora UNI: ${anchor}. Rede do proxy: ${proxyLoc}. O perfil antidetect é calibrado para que User-Agent, Canvas e WebGL permaneçam coerentes com o IP anunciado ao Google.`
  }
  if (anchor) {
    return `Âncora operacional: ${anchor}. O browser simulado segue esta região; não altere o proxy sem o time Ads Ativos.`
  }
  return 'Coerência fingerprint ↔ IP é garantida na montagem do perfil (AdsPower + pool Gerson). Não misture redes ou dispositivos pessoais nesta UNI.'
}

type Health = 'green' | 'yellow' | 'red'

function healthBadge(opts: {
  status: string
  compromisedAt: Date | null
  warmPhase: string
}): Health {
  if (opts.compromisedAt || opts.status === 'CRITICAL') return 'red'
  if (opts.status === 'REJECTED') return 'red'
  if (opts.warmPhase === 'WARMING') return 'yellow'
  if (opts.status === 'DELIVERED' && opts.warmPhase !== 'READY') return 'yellow'
  if (opts.status === 'IN_USE' && opts.warmPhase === 'READY') return 'green'
  if (opts.status === 'IN_USE') return 'yellow'
  return 'yellow'
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const [accounts, domains, uniAccess, armorySolicitations] = await Promise.all([
    prisma.stockAccount.findMany({
      where: {
        clientId: client.id,
        deletedAt: null,
        status: { in: ['DELIVERED', 'IN_USE', 'CRITICAL'] },
      },
      orderBy: { deliveredAt: 'desc' },
      take: 60,
      include: {
        mentoradoLinkedUni: {
          include: {
            matchedProxy: {
              select: { city: true, stateUf: true, provider: true, proxyHost: true, proxyPort: true },
            },
          },
        },
        productionG2: { select: { codeG2: true } },
        credential: { select: { email: true } },
        productionAccount: { select: { email: true } },
      },
    }),
    prisma.landingDomain.findMany({
      where: { clientId: client.id },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: {
        id: true,
        domain: true,
        sslStatus: true,
        shieldEnabled: true,
        shieldRequestedAt: true,
        shieldLastWebhookAt: true,
        shieldWebhookError: true,
        updatedAt: true,
      },
    }),
    prisma.clientMentoradoUniAccess.findMany({
      where: { clientId: client.id },
      include: {
        uni: {
          include: {
            matchedProxy: {
              select: { city: true, stateUf: true, provider: true, proxyHost: true, proxyPort: true },
            },
          },
        },
      },
    }),
    prisma.accountSolicitation.findMany({
      where: { clientId: client.id, kind: 'ARMORY' },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
  ])

  const fallbackUni = uniAccess.length === 1 ? uniAccess[0].uni : null

  const slaHours = Math.max(1, Math.min(168, Number(process.env.ARMORY_RMA_SLA_HOURS) || 48))

  const assets = accounts.map((a) => {
    const uni = a.mentoradoLinkedUni ?? fallbackUni
    const warm = warmUpFromDeliveredAt(a.deliveredAt)
    const health = healthBadge({
      status: a.status,
      compromisedAt: a.compromisedAt,
      warmPhase: warm.phase,
    })
    const proxyKey = uni
      ? proxyHostKeyFromParts(uni.matchedProxy?.proxyHost, uni.matchedProxy?.proxyPort)
      : null
    const proxyMasked = maskProxyHostKey(proxyKey)
    const cityLine = uni
      ? [uni.matchedProxy?.city, uni.matchedProxy?.stateUf, uni.anchorCity, uni.anchorState]
          .filter(Boolean)
          .slice(0, 4)
          .join(' · ')
      : null

    const adsPowerId = uni?.adsPowerProfileId?.trim() || null
    const adsPowerStartUrl = adsPowerId ? buildProfileStartUrl('ads_power', adsPowerId) : null

    const warmupLog = parseWarmupLog(a.mentoradoWarmupLogJson)
    const defaultWarmup =
      warmupLog.length === 0 && a.deliveredAt
        ? [
            { t: a.deliveredAt.toISOString(), msg: 'Perfil antidetect criado e vinculado à UNI.' },
            { t: a.deliveredAt.toISOString(), msg: 'Sessão de navegação em sites de notícias (tráfego residencial simulado).' },
            { t: a.deliveredAt.toISOString(), msg: 'Cookies de e-commerce de referência injetados (carrinho anónimo).' },
          ]
        : warmupLog

    return {
      id: a.id,
      platform: a.platform,
      googleAdsCustomerId: a.googleAdsCustomerId,
      status: a.status,
      deliveredAt: a.deliveredAt?.toISOString() ?? null,
      compromisedAt: a.compromisedAt?.toISOString() ?? null,
      label:
        a.googleAdsCustomerId ||
        a.productionG2?.codeG2 ||
        a.credential?.email ||
        a.productionAccount?.email ||
        a.id.slice(0, 8),
      uni: uni
        ? {
            id: uni.id,
            label: `UNI-${uni.id.replace(/-/g, '').slice(0, 4).toUpperCase()}`,
            fingerprintNote: fingerprintSyncNote(uni),
          }
        : null,
      proxyMasked,
      locationLine: cityLine || '—',
      health,
      healthLabel:
        health === 'green' ? 'Pronta' : health === 'yellow' ? 'Aquecendo / atenção' : 'Suspensa / crítico',
      warmUp: warm,
      adsPowerStartUrl,
      adsPowerInstructions: multiloginClientInstructions('ads_power'),
      warmupLog: defaultWarmup,
      codeG2: a.productionG2?.codeG2 ?? null,
    }
  })

  return NextResponse.json({
    assets,
    domains,
    armorySolicitations: armorySolicitations.map((s) => ({
      id: s.id,
      status: s.status,
      trafficSource: s.trafficSource,
      operationLevel: s.operationLevel,
      checkoutUrl: s.checkoutUrl,
      createdAt: s.createdAt.toISOString(),
      expectedDeliveryAt: s.expectedDeliveryAt?.toISOString() ?? null,
    })),
    hints: {
      rmaSlaHours: slaHours,
      fingerprintManifesto:
        'O IP do proxy e a impressão digital do browser são definidos em conjunto na provisão. Alterações manuais quebram a coerência e aumentam risco de revisão.',
    },
  })
}
