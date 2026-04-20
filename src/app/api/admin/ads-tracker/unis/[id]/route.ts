import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const u = await prisma.vaultIndustrialUnit.findUnique({
    where: { id },
    include: {
      inventoryGmail: { select: { email: true } },
      inventoryCnpj: { select: { cnpj: true, razaoSocial: true } },
      matchedProxy: true,
    },
  })
  if (!u) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  return NextResponse.json({
    uni: {
      id: u.id,
      status: u.status,
      displayName: u.displayName,
      primaryDomainHost: u.primaryDomainHost,
      timezoneIana: u.timezoneIana,
      preferredLocale: u.preferredLocale,
      customHeadersJson: u.customHeadersJson,
      riskLevel: u.riskLevel,
      killedAt: u.killedAt?.toISOString() ?? null,
      killedReason: u.killedReason,
      adsPowerProfileId: u.adsPowerProfileId,
      anchorCity: u.anchorCity,
      anchorState: u.anchorState,
      gmailMasked: maskEmail(u.inventoryGmail.email),
      cnpjMasked: maskCnpj(u.inventoryCnpj.cnpj),
      razaoSocial: u.inventoryCnpj.razaoSocial,
      matchedProxy: u.matchedProxy
        ? {
            id: u.matchedProxy.id,
            provider: u.matchedProxy.provider,
            label: u.matchedProxy.label,
            proxyHost: u.matchedProxy.proxyHost,
            proxyPort: u.matchedProxy.proxyPort,
            active: u.matchedProxy.active,
          }
        : null,
      lastProxyProbeAt: u.lastProxyProbeAt?.toISOString() ?? null,
      lastProxyProbeOk: u.lastProxyProbeOk,
      lastProxyProbeMs: u.lastProxyProbeMs,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
      headerIsolation: {
        suggestedUserAgent: suggestedChromeUaForUni(u.id),
        suggestedAcceptLanguage: suggestedAcceptLanguageForLocale(u.preferredLocale),
      },
    },
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const prev = await prisma.vaultIndustrialUnit.findUnique({ where: { id } })
  if (!prev) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  const logs: string[] = []

  if (body.displayName !== undefined) {
    const d =
      typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 200) || null : null
    data.displayName = d
    if (d !== prev.displayName) logs.push(`Nome da unidade atualizado`)
  }
  if (body.primaryDomainHost !== undefined) {
    const h = normalizePrimaryHost(body.primaryDomainHost === null ? null : String(body.primaryDomainHost))
    data.primaryDomainHost = h
    if (h !== prev.primaryDomainHost) logs.push(`Domínio principal definido: ${h || '—'}`)
  }
  if (typeof body.timezoneIana === 'string') {
    const t = body.timezoneIana.trim().slice(0, 64) || null
    data.timezoneIana = t
    if (t !== prev.timezoneIana) logs.push(`Timezone: ${t || '—'}`)
  }
  if (typeof body.preferredLocale === 'string') {
    const l = body.preferredLocale.trim().slice(0, 24) || null
    data.preferredLocale = l
    if (l !== prev.preferredLocale) logs.push(`Locale: ${l || '—'}`)
  }
  if (body.customHeadersJson !== undefined) {
    const next =
      body.customHeadersJson === null
        ? null
        : typeof body.customHeadersJson === 'object'
          ? body.customHeadersJson
          : null
    data.customHeadersJson = next
    logs.push('Cabeçalhos customizados (JSON) atualizados')
  }
  if (typeof body.riskLevel === 'string') {
    const r = body.riskLevel.toUpperCase()
    if (['LOW', 'MEDIUM', 'HIGH'].includes(r)) {
      data.riskLevel = r
      if (r !== prev.riskLevel) logs.push(`Risco: ${r}`)
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Sem alterações' }, { status: 400 })
  }

  await prisma.vaultIndustrialUnit.update({ where: { id }, data: data as object })
  for (const line of logs) {
    await appendUniActivityLog(prisma, id, 'config', line)
  }

  return NextResponse.json({ ok: true })
}
