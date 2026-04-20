import { NextResponse } from 'next/server'
import type { IntelligenceLeadStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/api-auth'
import { churnRiskFlags, customerHealthBand } from '@/lib/intelligence-leads-engine'
import { suggestUpsellSlugs } from '@/lib/intelligence-leads-upsell'
import { logCommercialDataAudit } from '@/lib/commercial-audit-log'
import { buildConversionPathSummary } from '@/lib/intelligence-conversion-path'

const ROLES_LIST = ['ADMIN', 'COMMERCIAL', 'FINANCE'] as const
const ROLES_EXPORT = ['ADMIN', 'FINANCE'] as const

const STATUSES: IntelligenceLeadStatus[] = ['NOVO', 'QUENTE', 'CLIENTE_ATIVO', 'CHURN']

function subUtcDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() - days)
  x.setUTCHours(23, 59, 59, 999)
  return x
}

function csvEscape(s: string): string {
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * GET /api/admin/intelligence-leads
 * Query: view, utm_source, status, absence_days=30|60|90 (com view=inativos), format=csv (só ADMIN/FINANCE)
 * view=lookalike: top compradores por LTV para CSV estilo audiência (email, telefone, nome — Meta)
 * COMMERCIAL: apenas leads com assignedCommercialId = utilizador (sem export CSV da base).
 */
export async function GET(req: Request) {
  const auth = await requireRoles([...ROLES_LIST])
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const format = url.searchParams.get('format') || ''
  const view = (url.searchParams.get('view') || 'geral').toLowerCase()
  const utmSource = url.searchParams.get('utm_source')?.trim()
  const statusParam = url.searchParams.get('status')?.trim().toUpperCase()
  const status =
    statusParam && (STATUSES as string[]).includes(statusParam) ? (statusParam as IntelligenceLeadStatus) : undefined

  const role = auth.session.user.role
  const userId = auth.session.user.id

  const absenceParam = url.searchParams.get('absence_days')
  const absenceDays =
    absenceParam === '60' || absenceParam === '90' ? parseInt(absenceParam, 10) : absenceParam === '30' ? 30 : 30

  const minLtvParam = url.searchParams.get('min_ltv')
  const minLtv = minLtvParam ? parseFloat(minLtvParam) : 0

  const now = new Date()
  const cutoff45 = subUtcDays(now, 45)
  const cutoff30Start = new Date(now)
  cutoff30Start.setUTCDate(cutoff30Start.getUTCDate() - 30)
  cutoff30Start.setUTCHours(0, 0, 0, 0)

  const filters: Prisma.IntelligenceLeadWhereInput[] = []

  if (role === 'COMMERCIAL') {
    filters.push({ assignedCommercialId: userId })
  }

  if (utmSource) {
    filters.push({ utmSource: { contains: utmSource } })
  }
  if (status) {
    filters.push({ status })
  }

  if (view === 'lookalike') {
    filters.push({ purchaseCount: { gt: 0 } })
    if (minLtv > 0 && Number.isFinite(minLtv)) {
      filters.push({ totalSales: { gte: minLtv } })
    }
  } else if (view === 'resgate_imediato') {
    filters.push({ cartRescueImmediate: true })
  } else if (view === 'recuperacao') {
    filters.push({
      OR: [
        { lastPurchaseAt: { not: null, lt: cutoff45 } },
        { lastPurchaseAt: null, createdAt: { lt: cutoff45 } },
      ],
    })
  } else if (view === 'inativos') {
    const cutoff = subUtcDays(now, absenceDays)
    filters.push({
      OR: [
        { lastPurchaseAt: { not: null, lt: cutoff } },
        { lastPurchaseAt: null, createdAt: { lt: cutoff } },
      ],
    })
  } else if (view === 'ativos') {
    filters.push({
      lastPurchaseAt: { not: null, gte: cutoff30Start },
    })
  }

  let where: Prisma.IntelligenceLeadWhereInput = {}
  if (filters.length === 1) where = filters[0]!
  else if (filters.length > 1) where = { AND: filters }

  const orderBy =
    view === 'lookalike'
      ? ([{ totalSales: 'desc' }, { purchaseCount: 'desc' }] as const)
      : view === 'resgate_imediato'
        ? ([{ updatedAt: 'desc' }] as const)
        : ([{ engagementScore: 'desc' }, { updatedAt: 'desc' }] as const)

  const rows = await prisma.intelligenceLead.findMany({
    where,
    orderBy: [...orderBy],
    take: format === 'csv' ? 5000 : view === 'lookalike' ? 500 : 500,
    select: {
      id: true,
      name: true,
      email: true,
      whatsapp: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      utmContent: true,
      utmTerm: true,
      utmFirstSource: true,
      utmFirstMedium: true,
      utmFirstCampaign: true,
      utmFirstContent: true,
      utmFirstTerm: true,
      trustScore: true,
      averageTicketBrl: true,
      status: true,
      lastPurchaseAt: true,
      totalSales: true,
      purchaseCount: true,
      lastProductName: true,
      engagementScore: true,
      confidenceScore: true,
      digitalFingerprintAlert: true,
      behaviorTags: true,
      purchasedProductSlugs: true,
      lastInteractionAt: true,
      cpaBrl: true,
      hotStalledAlert: true,
      commercialAiBrief: true,
      cartRescueImmediate: true,
      assignedCommercialId: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (format === 'csv') {
    if (!ROLES_EXPORT.includes(role as (typeof ROLES_EXPORT)[number])) {
      return NextResponse.json(
        { error: 'Exportação CSV reservada a ADMIN/FINANCE. Comercial: use atribuições e consulta na UI.' },
        { status: 403 },
      )
    }
    await logCommercialDataAudit({
      userId: auth.session.user.id,
      role: auth.session.user.role,
      action: 'EXPORT_INTELLIGENCE_CSV',
      entityType: 'INTELLIGENCE_LEADS',
      metadata: { view, min_ltv: minLtv > 0 ? minLtv : undefined },
    })

    const isLookalike = view === 'lookalike'
    const header = isLookalike
      ? [
          'email',
          'phone',
          'fn',
          'ln',
          'ltv_brl',
          'purchase_count',
          'utm_first_source',
          'utm_last_source',
          'conversion_path',
        ]
      : [
          'email',
          'nome',
          'whatsapp',
          'utm_first_source',
          'utm_first_campaign',
          'utm_last_source',
          'utm_last_campaign',
          'engagement_score',
          'confidence_score',
          'digital_fingerprint_alert',
          'cpa_brl',
          'hot_stalled',
          'cart_rescue',
          'ai_brief',
          'conversion_path',
          'ltv_brl',
          'lucro_cpa',
        ]
    const lines = [header.join(',')]
    for (const r of rows) {
      if (isLookalike) {
        const parts = r.name.trim().split(/\s+/)
        const fn = parts[0] || r.name
        const ln = parts.length > 1 ? parts.slice(1).join(' ') : ''
        lines.push(
          [
            csvEscape(r.email),
            csvEscape(r.whatsapp || ''),
            csvEscape(fn),
            csvEscape(ln),
            String(Number(r.totalSales)),
            String(r.purchaseCount),
            csvEscape(r.utmFirstSource || ''),
            csvEscape(r.utmSource || ''),
            csvEscape(buildConversionPathSummary(r)),
          ].join(','),
        )
      } else {
        lines.push(
          [
            csvEscape(r.email),
            csvEscape(r.name),
            csvEscape(r.whatsapp || ''),
            csvEscape(r.utmFirstSource || ''),
            csvEscape(r.utmFirstCampaign || ''),
            csvEscape(r.utmSource || ''),
            csvEscape(r.utmCampaign || ''),
            String(r.engagementScore),
            String(Number(r.confidenceScore)),
            r.trustScore != null ? String(r.trustScore) : '',
            r.averageTicketBrl != null ? String(Number(r.averageTicketBrl)) : '',
            r.digitalFingerprintAlert ? '1' : '0',
            r.cpaBrl != null ? String(Number(r.cpaBrl)) : '',
            r.hotStalledAlert ? '1' : '0',
            r.cartRescueImmediate ? '1' : '0',
            csvEscape((r.commercialAiBrief || '').slice(0, 200)),
            csvEscape(buildConversionPathSummary(r)),
            String(Number(r.totalSales)),
            String(Math.round((Number(r.totalSales) - Number(r.cpaBrl ?? 0)) * 100) / 100),
          ].join(','),
        )
      }
    }
    const body = lines.join('\n') + '\n'
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads-audiencia-${view}-${Date.now()}.csv"`,
      },
    })
  }

  return NextResponse.json({
    view,
    absence_days: view === 'inativos' ? absenceDays : null,
    min_ltv: view === 'lookalike' && minLtv > 0 ? minLtv : null,
    count: rows.length,
    rows: rows.map((r) => {
      const churn = churnRiskFlags({ status: r.status, lastPurchaseAt: r.lastPurchaseAt })
      const health = customerHealthBand({
        lastPurchaseAt: r.lastPurchaseAt,
        lastInteractionAt: r.lastInteractionAt,
        createdAt: r.createdAt,
      })
      const upsellSuggestions = suggestUpsellSlugs(r.purchasedProductSlugs)
      const cpa = r.cpaBrl != null ? Number(r.cpaBrl) : null
      const ltv = Number(r.totalSales)
      return {
        ...r,
        totalSales: ltv,
        cpaBrl: cpa,
        profitAfterCpaBrl: cpa != null ? Math.round((ltv - cpa) * 100) / 100 : null,
        conversionPathSummary: buildConversionPathSummary(r),
        confidenceScore: Number(r.confidenceScore),
        lastPurchaseAt: r.lastPurchaseAt?.toISOString() ?? null,
        lastInteractionAt: r.lastInteractionAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        churnRisk: churn.churnRisk,
        daysSincePurchase: churn.daysSincePurchase,
        customerHealth: health,
        upsellSuggestions,
      }
    }),
  })
}
