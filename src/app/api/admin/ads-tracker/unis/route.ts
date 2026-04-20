import { NextResponse } from 'next/server'
import { AdsTrackerCampaignStatus, VaultGmailStatus, VaultIndustrialUnitStatus } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'
import { maskCnpj, maskEmail } from '@/lib/gatekeeper/masking'
import { landingUrlToHost } from '@/lib/ads-tracker/urls'
import { appendUniActivityLog } from '@/lib/ads-tracker/uni-activity-log'
import { suggestedAcceptLanguageForLocale, suggestedChromeUaForUni } from '@/lib/ads-tracker/uni-header-fingerprint'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

function normalizePrimaryHost(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const t = raw.trim()
  const withProto = t.includes('://') ? t : `https://${t}`
  const h = landingUrlToHost(withProto)
  return h.ok ? h.host : null
}

function ipHealthFromRow(u: {
  killedAt: Date | null
  lastProxyProbeOk: boolean | null
  lastProxyProbeMs: number | null
  matchedProxyId: string | null
}): { level: 'ok' | 'warn' | 'bad'; label: string } {
  if (u.killedAt) return { level: 'bad', label: 'Kill-switch' }
  if (!u.matchedProxyId) return { level: 'warn', label: 'Sem proxy' }
  if (u.lastProxyProbeOk === false) return { level: 'bad', label: 'Proxy offline / falha' }
  if (u.lastProxyProbeOk === true && u.lastProxyProbeMs != null && u.lastProxyProbeMs > 3500) {
    return { level: 'warn', label: 'Latência alta' }
  }
  if (u.lastProxyProbeOk === null) return { level: 'warn', label: 'Sem probe recente' }
  return { level: 'ok', label: 'Probe OK' }
}

/**
 * GET — Grelha Módulo 11.
 * POST — Criação rápida (DRAFT) com Gmail+CNPJ e proxy novo ou existente (sem esteira AdsPower).
 */
export async function GET(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const take = Math.min(150, Math.max(1, Number(searchParams.get('take') || '80') || 80))

  const rows = await prisma.vaultIndustrialUnit.findMany({
    orderBy: { updatedAt: 'desc' },
    take,
    include: {
      inventoryGmail: { select: { email: true } },
      inventoryCnpj: { select: { cnpj: true } },
      matchedProxy: {
        select: {
          id: true,
          provider: true,
          label: true,
          proxyHost: true,
          proxyPort: true,
          active: true,
        },
      },
    },
  })

  const uniIds = rows.map((r) => r.id)
  const counts = await prisma.adsTrackerCampaign.groupBy({
    by: ['uniId'],
    where: {
      uniId: { in: uniIds },
      status: { not: AdsTrackerCampaignStatus.ARCHIVED },
    },
    _count: { _all: true },
  })
  const countMap = new Map(counts.map((c) => [c.uniId, c._count._all]))

  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const blockedAgg = await prisma.trafficShieldAccessLog.groupBy({
    by: ['uniId'],
    where: {
      uniId: { in: uniIds },
      verdict: 'BLOCKED',
      createdAt: { gte: since24 },
    },
    _count: { _all: true },
  })
  const blockedMap = new Map(
    blockedAgg.filter((b) => b.uniId).map((b) => [b.uniId as string, b._count._all])
  )

  return NextResponse.json({
    unis: rows.map((u) => {
      const health = ipHealthFromRow(u)
      const proxyInactive = u.matchedProxy && !u.matchedProxy.active
      const h = proxyInactive ? { level: 'bad' as const, label: 'Proxy desativado no pool' } : health
      return {
        id: u.id,
        status: u.status,
        displayName: u.displayName,
        killedAt: u.killedAt?.toISOString() ?? null,
        killedReason: u.killedReason,
        primaryDomainHost: u.primaryDomainHost,
        timezoneIana: u.timezoneIana,
        preferredLocale: u.preferredLocale,
        riskLevel: u.riskLevel,
        campaignsCount: countMap.get(u.id) ?? 0,
        blockedShield24h: blockedMap.get(u.id) ?? 0,
        suggestProxyRotation: (blockedMap.get(u.id) ?? 0) >= 8,
        ipHealth: h.level,
        ipHealthLabel: h.label,
        proxyEndpoint: u.matchedProxy ? `${u.matchedProxy.proxyHost}:${u.matchedProxy.proxyPort}` : null,
        proxyProvider: u.matchedProxy?.provider ?? null,
        proxyLabel: u.matchedProxy?.label ?? null,
        lastProxyProbeAt: u.lastProxyProbeAt?.toISOString() ?? null,
        lastProxyProbeOk: u.lastProxyProbeOk,
        lastProxyProbeMs: u.lastProxyProbeMs,
        gmailMasked: maskEmail(u.inventoryGmail.email),
        cnpjMasked: maskCnpj(u.inventoryCnpj.cnpj),
        adsPowerProfileId: u.adsPowerProfileId,
        anchorCity: u.anchorCity,
        anchorState: u.anchorState,
        activationAt: u.createdAt.toISOString(),
        headerIsolation: {
          suggestedUserAgent: suggestedChromeUaForUni(u.id),
          suggestedAcceptLanguage: suggestedAcceptLanguageForLocale(u.preferredLocale),
        },
      }
    }),
  })
}

export async function POST(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  let body: {
    displayName?: string
    inventoryGmailId?: string
    inventoryCnpjId?: string
    identityInventoryId?: string | null
    primaryDomainHost?: string | null
    timezoneIana?: string | null
    preferredLocale?: string | null
    riskLevel?: string | null
    matchedProxyId?: string | null
    newProxy?: {
      host: string
      port: string | number
      user?: string | null
      password?: string | null
    } | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const gmailId = typeof body.inventoryGmailId === 'string' ? body.inventoryGmailId.trim() : ''
  const cnpjId = typeof body.inventoryCnpjId === 'string' ? body.inventoryCnpjId.trim() : ''
  const displayName =
    typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 200) || null : null
  if (!gmailId || !cnpjId) {
    return NextResponse.json({ error: 'inventoryGmailId e inventoryCnpjId obrigatórios' }, { status: 400 })
  }

  const identityId =
    typeof body.identityInventoryId === 'string' && body.identityInventoryId.trim()
      ? body.identityInventoryId.trim()
      : null

  const gmail = await prisma.inventoryGmail.findUnique({ where: { id: gmailId } })
  const cnpjRow = await prisma.inventoryCnpj.findUnique({ where: { id: cnpjId } })
  if (!gmail || !cnpjRow) {
    return NextResponse.json({ error: 'Cofre Gmail/CNPJ não encontrado' }, { status: 404 })
  }
  if (gmail.status !== VaultGmailStatus.AVAILABLE) {
    return NextResponse.json({ error: 'Gmail não está AVAILABLE' }, { status: 409 })
  }

  if (identityId) {
    const idRow = await prisma.inventoryId.findUnique({ where: { id: identityId } })
    if (!idRow) return NextResponse.json({ error: 'Identidade não encontrada' }, { status: 404 })
  }

  let matchedProxyId: string | null =
    typeof body.matchedProxyId === 'string' && body.matchedProxyId.trim() ? body.matchedProxyId.trim() : null

  const np = body.newProxy
  if (np && typeof np.host === 'string' && np.host.trim()) {
    if (matchedProxyId) {
      return NextResponse.json({ error: 'Use matchedProxyId OU newProxy, não ambos' }, { status: 400 })
    }
    const portStr = String(np.port ?? '').replace(/\D/g, '').slice(0, 8) || '80'
    const proxyRow = await prisma.geoProxyPoolEntry.create({
      data: {
        provider: 'hospeda',
        label: (displayName || `UNI ${gmailId.slice(0, 8)}`).slice(0, 120),
        proxyHost: np.host.trim().slice(0, 255),
        proxyPort: portStr,
        proxyUser: np.user?.trim().slice(0, 200) || null,
        proxyPasswordEnc: np.password?.trim() ? encrypt(np.password.trim()) : null,
        proxySoft: 'other',
        active: true,
      },
    })
    matchedProxyId = proxyRow.id
  }

  if (matchedProxyId) {
    const px = await prisma.geoProxyPoolEntry.findUnique({ where: { id: matchedProxyId } })
    if (!px) return NextResponse.json({ error: 'Proxy não encontrado' }, { status: 404 })
  }

  const primaryHost = normalizePrimaryHost(body.primaryDomainHost ?? undefined)
  const tz = typeof body.timezoneIana === 'string' ? body.timezoneIana.trim().slice(0, 64) || null : null
  const loc = typeof body.preferredLocale === 'string' ? body.preferredLocale.trim().slice(0, 24) || null : null
  const risk =
    typeof body.riskLevel === 'string' && ['LOW', 'MEDIUM', 'HIGH'].includes(body.riskLevel.toUpperCase())
      ? body.riskLevel.toUpperCase()
      : 'MEDIUM'

  const unit = await prisma.vaultIndustrialUnit.create({
    data: {
      inventoryGmailId: gmail.id,
      inventoryCnpjId: cnpjRow.id,
      identityInventoryId: identityId,
      status: VaultIndustrialUnitStatus.DRAFT,
      displayName,
      primaryDomainHost: primaryHost,
      timezoneIana: tz,
      preferredLocale: loc,
      riskLevel: risk,
      matchedProxyId,
    },
  })

  await prisma.inventoryGmail.update({
    where: { id: gmail.id },
    data: { status: VaultGmailStatus.IN_USE },
  })

  await appendUniActivityLog(
    prisma,
    unit.id,
    'create',
    `UNI criada (rascunho Módulo 11)${displayName ? `: ${displayName}` : ''}.`
  )

  return NextResponse.json({
    id: unit.id,
    note: 'Para perfil AdsPower + esteira completa use Geo-Provision. Esta via é rascunho operacional com proxy manual.',
  })
}
