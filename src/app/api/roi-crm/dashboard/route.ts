import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getCampaignAttributionBreakdown, getRoiDashboardSeries } from '@/lib/roi-crm-queries'

const ROLES = ['ADMIN', 'COMMERCIAL', 'FINANCE']

function parseRange(req: NextRequest): { from: Date; to: Date } {
  const { searchParams } = new URL(req.url)
  const days = Math.min(365, Math.max(1, parseInt(searchParams.get('days') || '30', 10) || 30))
  const toParam = searchParams.get('to')
  const fromParam = searchParams.get('from')
  const to = toParam ? new Date(toParam) : new Date()
  to.setHours(23, 59, 59, 999)
  let from: Date
  if (fromParam) {
    from = new Date(fromParam)
    from.setHours(0, 0, 0, 0)
  } else {
    from = new Date(to)
    from.setDate(from.getDate() - (days - 1))
    from.setHours(0, 0, 0, 0)
  }
  return { from, to }
}

/**
 * Métricas consolidadas: ROI, LTV (soma perfis), CPA, série diária investimento vs faturamento.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { from, to } = parseRange(req)
  const [data, campaignAttribution] = await Promise.all([
    getRoiDashboardSeries(from, to),
    getCampaignAttributionBreakdown(from, to),
  ])

  return NextResponse.json(
    {
      periodo: { from: from.toISOString(), to: to.toISOString() },
      /** Referência do fechamento diário (BRT); a série do gráfico usa buckets por data ISO do evento. */
      fechamentoDiarioTimezone: 'America/Sao_Paulo',
      notaSerieGrafico:
        'Barras: soma por dia conforme data do pagamento (ou criação) do pedido e data do lançamento em ads_spend_daily (referência UTC no eixo). Para conferir um dia civil em Brasília, use «Fechamento de caixa (um dia)» no painel.',
      ...data,
      campaignAttribution: campaignAttribution.rows,
      campaignAttributionTotalRevenue: campaignAttribution.totalRevenue,
      formulas: {
        roi: '((Faturamento − Investimento) / Investimento) × 100',
        cpa: 'Investimento / quantidade de vendas (pedidos) no período',
        ltv: 'Soma de totalSpent dos perfis de cliente no ERP',
      },
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  )
}
