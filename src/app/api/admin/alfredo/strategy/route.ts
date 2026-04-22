/**
 * GET /api/admin/alfredo/strategy
 *
 * Motor de Decisão "Scale to Billion" — análise rule-based + IA opcional.
 * Retorna três blocos de ação estratégica:
 *   invest_more   → onde injetar capital para ROI máximo
 *   cut_loss      → ativos/fornecedores que drenam margem
 *   automation_alert → qual processo humano deve virar código
 *
 * Funciona 100% sem IA (regras determinísticas). Com OPENAI_API_KEY, adiciona
 * narrativa executiva e sugestões de automação em linguagem natural.
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions }      from '@/lib/auth'
import { buildAlfredoContext } from '@/lib/alfredo-context'
import { prisma }           from '@/lib/prisma'
import OpenAI               from 'openai'

export const runtime    = 'nodejs'
export const maxDuration = 45

// ── Tipos internos ────────────────────────────────────────────────────────────

type Action = {
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM'
  title:    string
  reason:   string
  impact:   string          // ex: "+R$50k/mês de margem"
  action:   string          // instrução concreta
  data?:    Record<string, number | string>
}

type StrategyResponse = {
  score:             number  // 0-100 health score geral
  invest_more:       Action[]
  cut_loss:          Action[]
  automation_alert:  Action[]
  narrative?:        string  // gerado pela IA se key disponível
  timestamp:         string
}

// ── Coleta de dados do ERP ────────────────────────────────────────────────────

async function collectData() {
  const now    = new Date()
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const mEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const d7     = new Date(Date.now() - 7  * 86400_000)
  const d30    = new Date(Date.now() - 30 * 86400_000)

  const [
    revMonth, burnMonth,
    vendorPerf, stockByStatus,
    blockedOrders, criticalTasks,
    teamCount, avgOrderAge,
    oldStock, recentSales,
  ] = await Promise.all([
    // Faturamento do mês
    prisma.assetSalesOrder.aggregate({
      where: { status: { in: ['DELIVERED', 'DELIVERING'] }, deliveredAt: { gte: mStart, lt: mEnd } },
      _sum:  { negotiatedPrice: true, grossMargin: true, costSnapshot: true },
      _count: true,
    }),
    // Burn Rate
    prisma.purchaseOrder.aggregate({
      where: { status: { in: ['PAID', 'PARTIALLY_PAID'] }, paidAt: { gte: mStart, lt: mEnd } },
      _sum:  { totalAmount: true },
    }),
    // Performance por fornecedor (taxa de cancelamento = proxy de bloqueio)
    prisma.assetSalesOrder.groupBy({
      by:    ['assetId'],
      where: { createdAt: { gte: d30 } },
      _count: true,
    }),
    // Estoque por status
    prisma.asset.groupBy({ by: ['status'], _count: true }),
    // OS pagas há >48h sem pagamento ao fornecedor
    prisma.assetSalesOrder.findMany({
      where:  { status: 'CLIENT_PAID', clientPaidAt: { lt: new Date(Date.now() - 48 * 3600_000) } },
      select: { id: true, negotiatedPrice: true, grossMargin: true },
      take:   50,
    }),
    // Tarefas CRITICAL paradas >3 dias
    prisma.ceoTask.count({
      where: { priority: 'CRITICAL', status: 'TODO', createdAt: { lt: new Date(Date.now() - 3 * 86400_000) } },
    }),
    // Membros do time (não-admin como proxy de tamanho do time)
    prisma.user.count({ where: { role: { not: 'ADMIN' } } }),
    // Idade média de ordens abertas (lead time)
    prisma.assetSalesOrder.findMany({
      where:  { status: { in: ['AWAITING_PAYMENT', 'APPROVED', 'PENDING_APPROVAL'] } },
      select: { createdAt: true },
      take:   100,
    }),
    // Ativos disponíveis há >30 dias (capital morto)
    prisma.asset.findMany({
      where:  { status: 'AVAILABLE', updatedAt: { lt: d30 } },
      select: { id: true, salePrice: true, costPrice: true, vendorId: true },
    }),
    // Vendas últimos 7 dias (velocity)
    prisma.assetSalesOrder.count({
      where: { createdAt: { gte: d7 }, status: { not: 'CANCELED' } },
    }),
  ])

  // Calcula taxa de bloqueio por fornecedor
  const canceledByVendor = await prisma.assetSalesOrder.findMany({
    where:  { status: 'CANCELED', createdAt: { gte: d30 } },
    select: { asset: { select: { vendorId: true, vendor: { select: { name: true } } } } },
  })
  const totalByVendor  = await prisma.assetSalesOrder.findMany({
    where:  { createdAt: { gte: d30 } },
    select: { asset: { select: { vendorId: true } } },
  })

  const vendorCancel: Record<string, { canceled: number; total: number; name: string }> = {}
  for (const o of totalByVendor) {
    const vid = o.asset?.vendorId ?? 'unknown'
    if (!vendorCancel[vid]) vendorCancel[vid] = { canceled: 0, total: 0, name: vid }
    vendorCancel[vid].total++
  }
  for (const o of canceledByVendor) {
    const vid  = o.asset?.vendorId ?? 'unknown'
    const name = o.asset?.vendor?.name ?? vid
    if (!vendorCancel[vid]) vendorCancel[vid] = { canceled: 0, total: 0, name }
    vendorCancel[vid].canceled++
    vendorCancel[vid].name = name
  }

  const avgLeadTimeHours = avgOrderAge.length === 0 ? 0
    : avgOrderAge.reduce((s, o) => s + (Date.now() - o.createdAt.getTime()), 0) / avgOrderAge.length / 3600_000

  const revenue     = Number(revMonth._sum.negotiatedPrice ?? 0)
  const grossMargin = Number(revMonth._sum.grossMargin     ?? 0)
  const burnRate    = Number(burnMonth._sum.totalAmount    ?? 0)
  const available   = stockByStatus.find((s) => s.status === 'AVAILABLE')?._count ?? 0
  const triagem     = stockByStatus.find((s) => s.status === 'TRIAGEM')?._count   ?? 0

  return {
    revenue, grossMargin, burnRate,
    salesCount:       revMonth._count,
    available, triagem,
    blockedOrders:    blockedOrders.length,
    blockedRevenue:   blockedOrders.reduce((s, o) => s + Number(o.negotiatedPrice), 0),
    blockedMargin:    blockedOrders.reduce((s, o) => s + Number(o.grossMargin), 0),
    criticalTasks,
    teamCount,
    avgLeadTimeHours,
    oldStock,
    deadStockValue:   oldStock.reduce((s, a) => s + Number(a.salePrice ?? 0), 0),
    deadStockCost:    oldStock.reduce((s, a) => s + Number(a.costPrice ?? 0), 0),
    recentSales,
    vendorCancel,
    burnPct:   burnRate / 300_000 * 100,
    revenuePct: revenue / 1_000_000 * 100,
    marginPct:  revenue > 0 ? grossMargin / revenue * 100 : 0,
    revenuePerMember: teamCount > 0 ? revenue / teamCount : 0,
  }
}

// ── Lógica determinística de ações ───────────────────────────────────────────

function buildActions(d: Awaited<ReturnType<typeof collectData>>) {
  const BRL = (v: number) => `R$${Math.round(v).toLocaleString('pt-BR')}`

  const invest: Action[] = []
  const cut:    Action[] = []
  const auto:   Action[] = []

  // ── INVEST MORE ────────────────────────────────────────────────────────────

  // 1. Estoque baixo + vendas aceleradas
  if (d.available < 10 && d.recentSales > 5) {
    invest.push({
      priority: 'CRITICAL',
      title:    'Estoque crítico com alta demanda',
      reason:   `Apenas ${d.available} ativos disponíveis com ${d.recentSales} vendas nos últimos 7 dias.`,
      impact:   `Potencial de +${BRL(d.recentSales * 3000)}/semana se estoque reabastecido`,
      action:   `Comprar mínimo de 30 ativos imediatamente. Priorizar fornecedores com rating >8.`,
      data:     { available: d.available, recentSales: d.recentSales },
    })
  }

  // 2. Burn rate baixo = sobra capital para investir
  if (d.burnPct < 50 && d.revenue < 500_000) {
    const available_budget = 300_000 - d.burnRate
    invest.push({
      priority: 'HIGH',
      title:    `Capital disponível: ${BRL(available_budget)} sem utilizar`,
      reason:   `Burn rate em ${d.burnPct.toFixed(1)}% do teto. Há margem para injetar capital em ativos de alto LTV.`,
      impact:   `+${BRL(available_budget * 0.4)}/mês estimado com alocação em contas vintage (2010-2016)`,
      action:   `Alocar ${BRL(available_budget * 0.6)} em lote de contas High Spend (HS) 2010-2016. Markup mínimo 40%.`,
      data:     { burnRate: d.burnRate, availableBudget: available_budget },
    })
  }

  // 3. Margem excelente → reinvestir nos melhores fornecedores
  if (d.marginPct > 50) {
    invest.push({
      priority: 'HIGH',
      title:    `Margem de ${d.marginPct.toFixed(0)}% — reinvestir lucro para escala`,
      reason:   `Margem bruta acima de 50% indica pricing saudável. Taxa de reinvestimento de 30% do lucro dobra o volume em 6 meses.`,
      impact:   `${BRL(d.grossMargin * 0.30)}/mês reinvestidos → projeção de ${BRL(d.revenue * 1.3)} no próximo ciclo`,
      action:   `Criar PO de ${BRL(d.grossMargin * 0.30)} para reposição de estoque de maior giro. Focar em fornecedores com rating 9-10.`,
      data:     { grossMargin: d.grossMargin, reinvestment: d.grossMargin * 0.3 },
    })
  }

  // ── CUT LOSS ───────────────────────────────────────────────────────────────

  // 1. Fornecedores com taxa de cancelamento > 15%
  for (const [, v] of Object.entries(d.vendorCancel)) {
    if (v.total < 3) continue
    const rate = v.canceled / v.total
    if (rate > 0.15) {
      cut.push({
        priority: 'CRITICAL',
        title:    `Fornecedor "${v.name}" com ${(rate * 100).toFixed(0)}% de falhas`,
        reason:   `${v.canceled} de ${v.total} ordens canceladas nos últimos 30 dias. Cada falha consome margem de garantia.`,
        impact:   `Eliminar drena ${BRL(v.canceled * 1500)} em reposições/mês`,
        action:   `Suspender novas compras deste fornecedor. Auditar os ${v.total - v.canceled} ativos restantes em Triagem.`,
        data:     { cancelRate: rate * 100, canceled: v.canceled, total: v.total },
      })
    }
  }

  // 2. Capital morto em estoque parado
  if (d.oldStock.length > 0) {
    cut.push({
      priority: 'HIGH',
      title:    `${d.oldStock.length} ativos parados >30 dias (capital morto: ${BRL(d.deadStockCost)})`,
      reason:   `Ativos sem giro trancam capital e não geram receita. Valor de venda potencial: ${BRL(d.deadStockValue)}.`,
      impact:   `Liquidação com 15% de desconto libera ${BRL(d.deadStockValue * 0.85)} e aumenta giro de caixa`,
      action:   `Gerar oferta relâmpago para os ${d.oldStock.length} ativos. Criar catálogo "Clearance" nas comunidades com desconto progressivo de 10-20%.`,
      data:     { count: d.oldStock.length, deadValue: d.deadStockValue, deadCost: d.deadStockCost },
    })
  }

  // 3. OS bloqueadas represando receita
  if (d.blockedOrders > 2) {
    cut.push({
      priority: 'CRITICAL',
      title:    `${d.blockedOrders} OS pagas pelo cliente sem pagamento ao fornecedor`,
      reason:   `${BRL(d.blockedRevenue)} em receita recebida mas ativos não liberados. Risco de chargeback e perda de reputação.`,
      impact:   `${BRL(d.blockedMargin)} de margem represada. Cada dia de atraso = risco de cancelamento`,
      action:   `Prioridade máxima: pagar fornecedores das ${d.blockedOrders} OS agora. Usar /dashboard/compras → Ordens de Serviço → status CLIENT_PAID.`,
      data:     { blockedOrders: d.blockedOrders, blockedRevenue: d.blockedRevenue },
    })
  }

  // ── AUTOMATION ALERT ───────────────────────────────────────────────────────

  // 1. Lead time alto = processo manual
  if (d.avgLeadTimeHours > 24) {
    auto.push({
      priority: 'HIGH',
      title:    `Lead time médio de ${d.avgLeadTimeHours.toFixed(0)}h — processo manual detectado`,
      reason:   `Ordens demoram mais de 24h para avançar de status. Em escala de 1.000 ordens/mês, isso é 1.000h de trabalho humano.`,
      impact:   `Automação de status → reduz lead time para <2h. Libera ${Math.round(d.avgLeadTimeHours * 0.8)}h/mês do time`,
      action:   `Implementar webhook de notificação automática quando cliente paga → dispara pagamento ao fornecedor → libera credencial. Zero toque humano.`,
      data:     { avgLeadTimeHours: d.avgLeadTimeHours },
    })
  }

  // 2. Tarefas CRITICAL paradas = gargalo humano
  if (d.criticalTasks > 0) {
    auto.push({
      priority: 'CRITICAL',
      title:    `${d.criticalTasks} tarefa(s) CRITICAL sem progresso há >3 dias`,
      reason:   `Tarefas críticas paradas indicam gargalo humano. Na filosofia do Bilhão: se um problema existe há >3 dias, ele precisa virar código.`,
      impact:   `Cada tarefa CRITICAL não resolvida é um vazamento direto na meta de R$1M`,
      action:   `Revisão agora no CEO Command Center. Para cada tarefa: o que impede a automação? Briefar o Cursor IA para criar o script.`,
      data:     { criticalTasks: d.criticalTasks },
    })
  }

  // 3. Eficiência por colaborador abaixo do benchmark
  const benchmark = 50_000 // R$50k/colaborador/mês = mínimo aceitável
  if (d.revenuePerMember < benchmark && d.teamCount > 0) {
    auto.push({
      priority: 'HIGH',
      title:    `Eficiência: ${d.teamCount > 0 ? `R$${Math.round(d.revenuePerMember / 1000)}k` : '—'}/colaborador (meta: R$50k+)`,
      reason:   `Métrica atual abaixo do benchmark de escala. No Bilhão, cada membro do time deve gerar >R$100k/mês via automação.`,
      impact:   `Dobrar automações sem contratar → chega em R$${Math.round(benchmark / 1000)}k/colaborador com mesmo time`,
      action:   `Mapear as 3 tarefas mais repetitivas do time (triagem, copy, conciliação) e automatizar via ERP. Custo: 0. Ganho: multiplicar output.`,
      data:     { revenuePerMember: d.revenuePerMember, teamCount: d.teamCount, benchmark },
    })
  }

  return { invest, cut, auto }
}

// ── Score de saúde geral ──────────────────────────────────────────────────────

function calcScore(d: Awaited<ReturnType<typeof collectData>>, cut: Action[], auto: Action[]): number {
  let score = 70
  if (d.revenuePct > 50) score += 10
  if (d.revenuePct > 80) score += 10
  if (d.marginPct  > 50) score += 5
  if (d.burnPct    < 60) score += 5
  score -= cut.filter((a) => a.priority === 'CRITICAL').length * 15
  score -= cut.filter((a) => a.priority === 'HIGH').length   * 5
  score -= auto.filter((a) => a.priority === 'CRITICAL').length * 10
  score -= d.blockedOrders * 3
  return Math.max(0, Math.min(100, score))
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso restrito ao CEO' }, { status: 403 })

  const d = await collectData()
  const { invest, cut, auto } = buildActions(d)
  const score = calcScore(d, cut, auto)

  let narrative: string | undefined

  if (process.env.OPENAI_API_KEY) {
    try {
      const erpContext = await buildAlfredoContext()
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const snap = `
Saúde operacional: ${score}/100
Revenue: R$${Math.round(d.revenue).toLocaleString('pt-BR')} | Margem: ${d.marginPct.toFixed(1)}%
Burn Rate: ${d.burnPct.toFixed(1)}% do teto | Estoque disponível: ${d.available}
OS bloqueadas: ${d.blockedOrders} | Capital morto: R$${Math.round(d.deadStockValue).toLocaleString('pt-BR')}
Ações INVEST: ${invest.length} | CUT: ${cut.length} | AUTO: ${auto.length}
Ações críticas: invest=${invest.filter(a=>a.priority==='CRITICAL').length}, cut=${cut.filter(a=>a.priority==='CRITICAL').length}, auto=${auto.filter(a=>a.priority==='CRITICAL').length}`

      const res = await openai.chat.completions.create({
        model:       process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens:  400,
        messages: [{
          role: 'user',
          content: `${erpContext}\n\n${snap}\n\nComo ALFREDO IA, escreva um parágrafo executivo (máx 3 frases) sintetizando: qual é o estado atual da operação, qual das 3 ações (invest/cut/auto) é mais urgente e por quê. Seja direto, use os números reais. Termine com "🎯 PRÓXIMO PASSO:" e 1 ação concreta.`,
        }],
      })
      narrative = res.choices[0]?.message?.content ?? undefined
    } catch { /* fallback sem narrativa */ }
  }

  const response: StrategyResponse = {
    score,
    invest_more:      invest,
    cut_loss:         cut,
    automation_alert: auto,
    narrative,
    timestamp:        new Date().toISOString(),
  }

  return NextResponse.json(response)
}
