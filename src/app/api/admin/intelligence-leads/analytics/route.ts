import { NextResponse } from 'next/server'
import type { IntelligenceLeadStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/api-auth'
import { computeRfmRankings } from '@/lib/intelligence-leads-engine'
import { campaignSpendKey } from '@/lib/intelligence-utm-normalize'

const ROLES = ['ADMIN', 'COMMERCIAL', 'FINANCE'] as const

function utmLabel(raw: string | null | undefined): string {
  const s = raw?.trim()
  return s && s.length ? s : '(sem fonte)'
}

function campaignLabel(raw: string | null | undefined): string {
  const s = raw?.trim()
  return s && s.length ? s : '(sem campanha)'
}

/**
 * GET /api/admin/intelligence-leads/analytics
 * - bySource: leads, compradores (CLIENTE_ATIVO), taxa, LTV
 * - byCampaign: mesmo por utm_campaign (ROI real por criativo/campanha)
 * - rfmTopPct: top ~1% por LTV (elite VIP)
 */
export async function GET(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const role = auth.session.user.role
  const userId = auth.session.user.id

  const monthParam = url.searchParams.get('spend_month')?.trim()
  let spendWhere: Prisma.IntelligenceCampaignSpendWhereInput = {}
  if (monthParam && /^\d{4}-\d{2}/.test(monthParam)) {
    const [y, m] = monthParam.slice(0, 7).split('-').map(Number)
    spendWhere.periodMonth = new Date(Date.UTC(y!, m! - 1, 1))
  }

  const spendRows = await prisma.intelligenceCampaignSpend.findMany({
    where: spendWhere,
    select: { utmSource: true, utmCampaign: true, spendBrl: true },
  })
  const spendByKey = new Map<string, number>()
  for (const s of spendRows) {
    const k = campaignSpendKey(s.utmSource, s.utmCampaign)
    spendByKey.set(k, (spendByKey.get(k) ?? 0) + Number(s.spendBrl))
  }

  const commercialWhere =
    role === 'COMMERCIAL' ? { assignedCommercialId: userId } : {}

  const cellsSource = await prisma.intelligenceLead.groupBy({
    by: ['utmSource', 'status'],
    where: commercialWhere,
    _count: { id: true },
    _sum: { totalSales: true },
  })

  const bySourceMap = new Map<
    string,
    { leads: number; clienteAtivo: number; totalVendas: number }
  >()
  for (const c of cellsSource) {
    const k = utmLabel(c.utmSource)
    const cur = bySourceMap.get(k) ?? { leads: 0, clienteAtivo: 0, totalVendas: 0 }
    cur.leads += c._count.id
    if (c.status === 'CLIENTE_ATIVO') cur.clienteAtivo += c._count.id
    cur.totalVendas += Number(c._sum.totalSales ?? 0)
    bySourceMap.set(k, cur)
  }

  const bySource = [...bySourceMap.entries()]
    .map(([utm_source, a]) => ({
      utm_source,
      leads: a.leads,
      cliente_ativo: a.clienteAtivo,
      taxa_conversao_cliente_pct: a.leads > 0 ? Math.round((a.clienteAtivo / a.leads) * 1000) / 10 : 0,
      total_vendas: a.totalVendas,
      ltv_medio_por_lead: a.leads > 0 ? Math.round((a.totalVendas / a.leads) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.total_vendas - a.total_vendas || b.leads - a.leads)

  const cellsCampaign = await prisma.intelligenceLead.groupBy({
    by: ['utmCampaign', 'utmSource', 'status'],
    where: commercialWhere,
    _count: { id: true },
    _sum: { totalSales: true, cpaBrl: true },
  })

  const campMap = new Map<
    string,
    {
      key: string
      utm_source: string
      utm_campaign: string
      leads: number
      clienteAtivo: number
      totalVendas: number
      sumCpaLeads: number
    }
  >()
  for (const c of cellsCampaign) {
    const camp = campaignLabel(c.utmCampaign)
    const src = utmLabel(c.utmSource)
    const key = `${src}||${camp}`
    const cur =
      campMap.get(key) ?? {
        key,
        utm_source: src,
        utm_campaign: camp,
        leads: 0,
        clienteAtivo: 0,
        totalVendas: 0,
        sumCpaLeads: 0,
      }
    cur.leads += c._count.id
    if (c.status === 'CLIENTE_ATIVO') cur.clienteAtivo += c._count.id
    cur.totalVendas += Number(c._sum.totalSales ?? 0)
    cur.sumCpaLeads += Number(c._sum.cpaBrl ?? 0)
    campMap.set(key, cur)
  }

  const byCampaign = [...campMap.values()]
    .map((a) => {
      const sk = campaignSpendKey(a.utm_source, a.utm_campaign)
      const spendAds = spendByKey.get(sk) ?? 0
      const lucroPorLeadCpa = a.totalVendas - a.sumCpaLeads
      const lucroAposAds = a.totalVendas - spendAds
      const roas = spendAds > 0 ? Math.round((a.totalVendas / spendAds) * 100) / 100 : null
      return {
        utm_source: a.utm_source,
        utm_campaign: a.utm_campaign,
        leads: a.leads,
        cliente_ativo: a.clienteAtivo,
        taxa_conversao_cliente_pct: a.leads > 0 ? Math.round((a.clienteAtivo / a.leads) * 1000) / 10 : 0,
        total_vendas: a.totalVendas,
        sum_cpa_leads_brl: Math.round(a.sumCpaLeads * 100) / 100,
        lucro_com_cpa_leads_brl: Math.round(lucroPorLeadCpa * 100) / 100,
        spend_ads_mes_brl: Math.round(spendAds * 100) / 100,
        lucro_apos_spend_ads_brl: Math.round(lucroAposAds * 100) / 100,
        roas,
        ltv_medio_por_lead: a.leads > 0 ? Math.round((a.totalVendas / a.leads) * 100) / 100 : 0,
      }
    })
    .sort((x, y) => y.total_vendas - x.total_vendas || y.taxa_conversao_cliente_pct - x.taxa_conversao_cliente_pct)

  const forRfm = await prisma.intelligenceLead.findMany({
    where: commercialWhere,
    select: {
      id: true,
      name: true,
      email: true,
      lastPurchaseAt: true,
      purchaseCount: true,
      totalSales: true,
    },
    take: 2000,
  })

  const { topPct } = computeRfmRankings(
    forRfm.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      lastPurchaseAt: r.lastPurchaseAt,
      purchaseCount: r.purchaseCount,
      totalSales: Number(r.totalSales),
    })),
  )

  const sort = url.searchParams.get('sort') || 'ltv'
  const bySourceSorted =
    sort === 'leads' ? [...bySource].sort((a, b) => b.leads - a.leads) : bySource

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    sort_default: 'ltv',
    bySource: bySourceSorted,
    byCampaign,
    rfmTopPct: topPct.map((r) => ({
      leadId: r.leadId,
      name: r.name,
      email: r.email,
      recencia_dias: r.recencyDays,
      frequencia: r.frequency,
      valor_ltv: r.monetary,
    })),
    spend_month_filter: monthParam || null,
    note:
      'byCampaign: LTV vs soma CPA por lead (webhook) e vs gasto de ads (POST /api/admin/intelligence-leads/campaign-spend). Use spend_month=YYYY-MM para filtrar spend. Sincronize LTV: POST /api/admin/intelligence-leads/sync-orders.',
  })
}
