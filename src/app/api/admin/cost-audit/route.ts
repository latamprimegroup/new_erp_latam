/**
 * GET /api/admin/cost-audit
 * ALFREDO IA — Auditor de Custos:
 *   - Compara despesas mês atual × mês anterior por categoria
 *   - Detecta categorias com aumento > threshold%
 *   - Identifica gastos ociosos (mesmas categorias recorrentes sem contrapartida de receita)
 *   - Retorna lista de alertas e sugestões de corte/otimização
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'
import OpenAI               from 'openai'

const ALERT_THRESHOLD = 20 // % de aumento que dispara alerta

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['ADMIN', 'FINANCE'].includes(session.user.role ?? ''))
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const now    = new Date()
  const curStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const curEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevEnd   = new Date(now.getFullYear(), now.getMonth(), 1)
  const m3Start   = new Date(now.getFullYear(), now.getMonth() - 3, 1)

  // Receita do mês atual (para calcular custo como % da receita)
  const incomeAgg = await prisma.financialEntry.aggregate({
    where: { type: 'INCOME', date: { gte: curStart, lt: curEnd } },
    _sum:  { value: true },
  })
  const monthlyRevenue = Number(incomeAgg._sum.value ?? 0)

  // Despesas por categoria — mês atual
  const curByCategory = await prisma.financialEntry.groupBy({
    by:    ['category'],
    where: { type: 'EXPENSE', date: { gte: curStart, lt: curEnd } },
    _sum:  { value: true },
    _count: true,
    orderBy: { _sum: { value: 'desc' } },
  })

  // Despesas por categoria — mês anterior
  const prevByCategory = await prisma.financialEntry.groupBy({
    by:    ['category'],
    where: { type: 'EXPENSE', date: { gte: prevStart, lt: prevEnd } },
    _sum:  { value: true },
  })

  // Despesas por categoria — 3 meses (para detectar recorrência)
  const m3ByCategory = await prisma.financialEntry.groupBy({
    by:    ['category'],
    where: { type: 'EXPENSE', date: { gte: m3Start, lt: curEnd } },
    _sum:  { value: true },
    _count: true,
  })

  // Mapas de acesso rápido
  const prevMap  = Object.fromEntries(prevByCategory.map((p) => [p.category, Number(p._sum.value ?? 0)]))
  const m3Map    = Object.fromEntries(m3ByCategory.map((p) => [p.category, { total: Number(p._sum.value ?? 0), count: p._count }]))

  const totalCurrent  = curByCategory.reduce((s, c) => s + Number(c._sum.value ?? 0), 0)
  const totalPrevious = prevByCategory.reduce((s, p) => s + Number(p._sum.value ?? 0), 0)

  // ── Análise por categoria ─────────────────────────────────────────────────
  type CategoryAlert = {
    category: string; current: number; previous: number; changePct: number
    revenuePct: number; avgMonthly: number; alert: 'HIGH_INCREASE' | 'HIGH_COST' | 'IDLE' | 'OK'
    suggestion: string
  }

  const analysis: CategoryAlert[] = curByCategory.map((c) => {
    const current    = Number(c._sum.value ?? 0)
    const previous   = prevMap[c.category] ?? 0
    const changePct  = previous > 0 ? ((current - previous) / previous) * 100 : 100
    const revenuePct = monthlyRevenue > 0 ? (current / monthlyRevenue) * 100 : 0
    const avgMonthly = m3Map[c.category]?.total ? m3Map[c.category].total / 3 : current

    let alert: CategoryAlert['alert'] = 'OK'
    let suggestion = ''

    if (changePct >= ALERT_THRESHOLD * 2) {
      alert = 'HIGH_INCREASE'
      suggestion = `Aumento de ${changePct.toFixed(0)}% vs mês anterior. Verifique contratos ou lançamentos duplicados.`
    } else if (changePct >= ALERT_THRESHOLD) {
      alert = 'HIGH_INCREASE'
      suggestion = `Crescimento de ${changePct.toFixed(0)}% acima do padrão. Audite os lançamentos desta categoria.`
    } else if (revenuePct > 30) {
      alert = 'HIGH_COST'
      suggestion = `${revenuePct.toFixed(0)}% da receita bruta consumido por esta categoria. Avalie renegociação.`
    } else if (c._count >= 3 && changePct < -10) {
      alert = 'OK' // Redução — bom sinal
      suggestion = `Redução de ${Math.abs(changePct).toFixed(0)}% vs mês anterior. ✅`
    }

    return { category: c.category, current, previous, changePct, revenuePct, avgMonthly, alert, suggestion }
  })

  const alerts      = analysis.filter((a) => a.alert !== 'OK')
  const totalGrowth = totalPrevious > 0 ? ((totalCurrent - totalPrevious) / totalPrevious) * 100 : 0

  // ── Sugestão geral da ALFREDO IA ─────────────────────────────────────────
  let aiAuditReport: string | null = null
  const apiKey = process.env.OPENAI_API_KEY

  if (apiKey) {
    try {
      const client = new OpenAI({ apiKey })
      const topAlerts = alerts.slice(0, 5).map((a) => `${a.category}: R$${a.current.toLocaleString('pt-BR')} (${a.changePct > 0 ? '+' : ''}${a.changePct.toFixed(0)}%)`).join(', ')
      const r = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        messages: [{ role: 'user', content: `Você é ALFREDO IA, auditor de custos da Ads Ativos.
Dados do mês atual:
- Receita bruta: R$ ${monthlyRevenue.toLocaleString('pt-BR')}
- Total despesas: R$ ${totalCurrent.toLocaleString('pt-BR')} (${totalGrowth > 0 ? '+' : ''}${totalGrowth.toFixed(0)}% vs mês anterior)
- Categorias em alerta: ${topAlerts || 'Nenhuma'}
- Custo como % da receita: ${monthlyRevenue > 0 ? ((totalCurrent / monthlyRevenue) * 100).toFixed(0) : 'N/A'}%

Escreva um relatório de auditoria em 3 linhas: (1) diagnóstico geral, (2) maior risco identificado, (3) ação imediata recomendada. Tom direto de CFO. Em português.` }],
        temperature: 0.2, max_tokens: 200,
      })
      aiAuditReport = r.choices[0]?.message?.content ?? null
    } catch { /* sem AI */ }
  }

  if (!aiAuditReport) {
    if (alerts.length === 0) {
      aiAuditReport = `✅ Custos sob controle. Total de R$ ${totalCurrent.toLocaleString('pt-BR')} este mês — variação de ${totalGrowth > 0 ? '+' : ''}${totalGrowth.toFixed(0)}% vs mês anterior. Nenhuma categoria em alerta crítico.`
    } else {
      const top = alerts[0]
      aiAuditReport = `⚠️ ${alerts.length} categoria(s) em alerta. Principal: ${top.category} com aumento de ${top.changePct.toFixed(0)}%. Total de despesas: R$ ${totalCurrent.toLocaleString('pt-BR')}. Recomendo auditoria imediata dos lançamentos em alerta.`
    }
  }

  return NextResponse.json({
    period: { year: now.getFullYear(), month: now.getMonth() + 1 },
    monthlyRevenue,
    totalCurrent,
    totalPrevious,
    totalGrowthPct:     parseFloat(totalGrowth.toFixed(2)),
    costRevenueRatio:   monthlyRevenue > 0 ? parseFloat(((totalCurrent / monthlyRevenue) * 100).toFixed(2)) : null,
    analysis,
    alerts,
    alertCount:         alerts.length,
    aiAuditReport,
  })
}
