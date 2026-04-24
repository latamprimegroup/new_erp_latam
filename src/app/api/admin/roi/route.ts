/**
 * GET /api/admin/roi
 *
 * Painel de ROI real — cruza leads capturados no checkout com
 * vendas aprovadas, agrupando por campanha UTM.
 *
 * Retorna:
 *  - Funil global (leads → PIX gerado → pago)
 *  - KPIs gerais (faturamento, ticket médio, taxa de conversão)
 *  - Ranking de campanhas (utm_campaign) com CPA e ROI estimado
 *  - Ranking de fontes (utm_source)
 *  - Leads recentes (últimas 24h)
 *  - Checkouts em aberto (PIX gerado mas não pago — abandono)
 *
 * Acesso: ADMIN
 */
import { NextResponse }     from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const days = Math.min(parseInt(searchParams.get('days') ?? '30', 10), 365)
  const since = new Date(Date.now() - days * 86_400_000)

  // ── 1. Todos os leads no período ──────────────────────────────────────────
  const leads = await prisma.lead.findMany({
    where:   { createdAt: { gte: since } },
    include: { checkouts: { select: { id: true, status: true, amount: true, paidAt: true, createdAt: true } } },
    orderBy: { createdAt: 'desc' },
  })

  // ── 2. Checkouts pagos ────────────────────────────────────────────────────
  const paidCheckouts = leads
    .flatMap((l) => l.checkouts)
    .filter((c) => c.status === 'PAID')

  const totalLeads    = leads.length
  const totalCheckouts = leads.reduce((s, l) => s + l.checkouts.length, 0)
  const totalPaid     = paidCheckouts.length
  const totalRevenue  = paidCheckouts.reduce((s, c) => s + Number(c.amount), 0)
  const avgTicket     = totalPaid > 0 ? totalRevenue / totalPaid : 0
  const convRate      = totalCheckouts > 0 ? (totalPaid / totalCheckouts) * 100 : 0
  const pixConvRate   = totalLeads > 0 ? (totalCheckouts / totalLeads) * 100 : 0

  // ── 3. Agrupamento por utm_campaign ───────────────────────────────────────
  type CampaignRow = {
    campaign:    string
    source:      string
    medium:      string
    leads:       number
    checkouts:   number
    paid:        number
    revenue:     number
    convRate:    number
    avgTicket:   number
    cpa:         number   // custo estimado por aquisição (placeholder — sem gasto real)
  }

  const campaignMap = new Map<string, CampaignRow>()

  for (const lead of leads) {
    const key = lead.utmCampaign ?? '(direto/orgânico)'
    if (!campaignMap.has(key)) {
      campaignMap.set(key, {
        campaign:  key,
        source:    lead.utmSource  ?? '(sem source)',
        medium:    lead.utmMedium  ?? '(sem medium)',
        leads:     0,
        checkouts: 0,
        paid:      0,
        revenue:   0,
        convRate:  0,
        avgTicket: 0,
        cpa:       0,
      })
    }
    const row = campaignMap.get(key)!
    row.leads++
    row.checkouts += lead.checkouts.length
    const paid = lead.checkouts.filter((c) => c.status === 'PAID')
    row.paid    += paid.length
    row.revenue += paid.reduce((s, c) => s + Number(c.amount), 0)
  }

  const campaigns = Array.from(campaignMap.values()).map((row) => ({
    ...row,
    convRate:  row.checkouts > 0 ? (row.paid / row.checkouts) * 100 : 0,
    avgTicket: row.paid > 0 ? row.revenue / row.paid : 0,
    // CPA real requer integração com dashboard de gastos — exibe 0 até conectar
    cpa:       0,
  })).sort((a, b) => b.revenue - a.revenue)

  // ── 4. Agrupamento por utm_source ─────────────────────────────────────────
  const sourceMap = new Map<string, { source: string; leads: number; paid: number; revenue: number }>()
  for (const lead of leads) {
    const key = lead.utmSource ?? '(orgânico)'
    if (!sourceMap.has(key)) sourceMap.set(key, { source: key, leads: 0, paid: 0, revenue: 0 })
    const row = sourceMap.get(key)!
    row.leads++
    const paid = lead.checkouts.filter((c) => c.status === 'PAID')
    row.paid    += paid.length
    row.revenue += paid.reduce((s, c) => s + Number(c.amount), 0)
  }
  const sources = Array.from(sourceMap.values()).sort((a, b) => b.revenue - a.revenue)

  // ── 5. Checkouts em aberto (abandono) ─────────────────────────────────────
  const abandoned = leads
    .flatMap((l) => l.checkouts.filter((c) => c.status === 'PENDING').map((c) => ({
      checkoutId: c.id,
      leadName:   l.name,
      whatsapp:   l.whatsapp,
      adsId:      l.adsId,
      amount:     Number(c.amount),
      createdAt:  c.createdAt,
    })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 30)

  // ── 6. Leads recentes (últimas 24h) ───────────────────────────────────────
  const last24h = new Date(Date.now() - 86_400_000)
  const recentLeads = leads
    .filter((l) => new Date(l.createdAt) >= last24h)
    .slice(0, 20)
    .map((l) => ({
      id:        l.id,
      name:      l.name,
      whatsapp:  l.whatsapp,
      adsId:     l.adsId,
      campaign:  l.utmCampaign,
      source:    l.utmSource,
      paid:      l.checkouts.some((c) => c.status === 'PAID'),
      createdAt: l.createdAt,
    }))

  return NextResponse.json({
    period: { days, since: since.toISOString() },
    funnel: {
      totalLeads,
      totalCheckouts,
      totalPaid,
      pixConvRate:  Math.round(pixConvRate * 10) / 10,
      checkoutConvRate: Math.round(convRate * 10) / 10,
    },
    kpis: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgTicket:    Math.round(avgTicket * 100) / 100,
    },
    campaigns,
    sources,
    abandoned,
    recentLeads,
  })
}
