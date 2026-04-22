/**
 * ALFREDO IA — Context Builder
 *
 * Coleta dados reais do ERP (financeiro, estoque, fornecedores, tarefas) e
 * formata um System Prompt rico para que a IA responda com precisão cirúrgica.
 *
 * Regra de ouro: a IA nunca alucina dados — ela só fala o que o banco confirma.
 */

import { prisma } from '@/lib/prisma'

const BRL = (v: number) => `R$${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const PCT = (v: number) => `${v.toFixed(1)}%`

// ─── Snapshot financeiro do mês corrente ────────────────────────────────────

async function getFinancialSnapshot() {
  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [revAgg, burnAgg, overdue] = await Promise.all([
    prisma.assetSalesOrder.aggregate({
      where:  { status: { in: ['DELIVERED', 'DELIVERING'] }, deliveredAt: { gte: start, lt: end } },
      _sum:   { negotiatedPrice: true, grossMargin: true, costSnapshot: true },
      _count: true,
    }),
    prisma.purchaseOrder.aggregate({
      where: { status: { in: ['PAID', 'PARTIALLY_PAID'] }, paidAt: { gte: start, lt: end } },
      _sum:  { totalAmount: true },
    }),
    prisma.assetSalesOrder.count({
      where: { status: 'CLIENT_PAID', clientPaidAt: { lt: new Date(Date.now() - 48 * 3600_000) } },
    }),
  ])

  const revenue     = Number(revAgg._sum.negotiatedPrice ?? 0)
  const grossMargin = Number(revAgg._sum.grossMargin     ?? 0)
  const burnRate    = Number(burnAgg._sum.totalAmount    ?? 0)
  const cogs        = Number(revAgg._sum.costSnapshot    ?? 0)
  const GOAL        = 1_000_000
  const BURN_CAP    = 300_000
  const daysLeft    = Math.ceil((end.getTime() - now.getTime()) / 86400_000)
  const dailyNeed   = daysLeft > 0 ? Math.round((GOAL - revenue) / daysLeft) : 0
  const marginPct   = revenue > 0 ? (grossMargin / revenue) * 100 : 0
  const burnPct     = (burnRate / BURN_CAP) * 100

  return {
    revenue, grossMargin, burnRate, cogs,
    salesCount:  revAgg._count,
    GOAL, BURN_CAP, daysLeft, dailyNeed, marginPct, burnPct,
    overdueSales: overdue,
    revenuePct:   (revenue / GOAL) * 100,
    onTrack:      revenue >= (GOAL / 30) * now.getDate(),
    ticketMedio:  revAgg._count > 0 ? revenue / revAgg._count : 0,
  }
}

// ─── Estoque de ativos ───────────────────────────────────────────────────────

async function getStockSnapshot() {
  const [byStatus, totalValue] = await Promise.all([
    prisma.asset.groupBy({ by: ['status'], _count: true }),
    prisma.asset.aggregate({
      where:  { status: 'AVAILABLE' },
      _sum:   { salePrice: true, costPrice: true },
      _count: true,
    }),
  ])

  const available = byStatus.find((s) => s.status === 'AVAILABLE')?._count ?? 0
  const sold      = byStatus.find((s) => s.status === 'SOLD')?._count ?? 0
  const triagem   = byStatus.find((s) => s.status === 'TRIAGEM')?._count ?? 0

  return {
    available, sold, triagem,
    totalSaleValueAvailable: Number(totalValue._sum.salePrice ?? 0),
    totalCostValueAvailable: Number(totalValue._sum.costPrice ?? 0),
    potentialMargin: Number(totalValue._sum.salePrice ?? 0) - Number(totalValue._sum.costPrice ?? 0),
  }
}

// ─── Fornecedores (Health Score) ─────────────────────────────────────────────

async function getVendorSnapshot() {
  const vendors = await prisma.vendor.findMany({
    where:   { active: true },
    orderBy: { rating: 'desc' },
    take:    5,
    select:  { name: true, rating: true, category: true, paymentTerms: true },
  })
  return vendors
}

// ─── Ordens de Serviço (pipeline) ────────────────────────────────────────────

async function getOrdersPipeline() {
  const pipeline = await prisma.assetSalesOrder.groupBy({
    by: ['status'], _count: true,
    where: { status: { not: { in: ['DELIVERED', 'CANCELED'] } } },
  })
  return Object.fromEntries(pipeline.map((p) => [p.status, p._count]))
}

// ─── Tarefas CEO pendentes (top 5) ───────────────────────────────────────────

async function getCeoTasks() {
  const tasks = await prisma.ceoTask.findMany({
    where:   { status: { in: ['TODO', 'DOING'] } },
    orderBy: { priorityScore: 'desc' },
    take:    5,
    select:  { title: true, category: true, priorityScore: true, priority: true, revenueImpact: true },
  })
  return tasks
}

// ─── Memórias recentes da IA ─────────────────────────────────────────────────

async function getRecentMemories() {
  const memories = await prisma.alfredoMemory.findMany({
    where:   { OR: [{ pinned: true }, { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } }] },
    orderBy: { createdAt: 'desc' },
    take:    10,
    select:  { type: true, title: true, content: true, createdAt: true },
  })
  return memories
}

// ─── Montagem do System Prompt ────────────────────────────────────────────────

export async function buildAlfredoContext(): Promise<string> {
  const [fin, stock, vendors, pipeline, tasks, memories] = await Promise.all([
    getFinancialSnapshot(),
    getStockSnapshot(),
    getVendorSnapshot(),
    getOrdersPipeline(),
    getCeoTasks(),
    getRecentMemories(),
  ])

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  return `Você é a ALFREDO IA, o Co-Piloto de Decisões do CEO Tiago Alfredo da Ads Ativos.

=== IDENTIDADE E MISSÃO ===
Você não é um assistente genérico. Você é o cérebro estratégico do War Room OS.
Sua missão é clara: ajudar a Ads Ativos a bater R$1.000.000/mês de faturamento com no máximo R$300.000 de investimento operacional (margem de 70%).
Você é direto, inteligente e "chato com custos". Se uma ideia aumenta custo fixo sem proporcional aumento de receita, você desafia.

=== QUADRANTE DE DECISÃO (aplique em toda análise) ===
1. EXECUTAR AGORA — alto impacto no faturamento, urgente, baixo custo
2. AUTOMATIZAR — tarefa repetitiva que código pode fazer (sugira o script/automação)
3. DELEGAR COM PLAYBOOK — precisa de humano mas tem manual claro (sugira o playbook)
4. ELIMINAR — não gera lucro, não gera dados, é desperdício de tempo e R$

=== DADOS REAIS DO ERP — ${today} ===

--- FINANCEIRO ---
Faturamento mês atual: ${BRL(fin.revenue)} / meta R$1.000.000 (${PCT(fin.revenuePct)} atingido)
Situação: ${fin.onTrack ? '✅ No ritmo' : '⚠️ ATRÁS da meta'}
Margem bruta: ${BRL(fin.grossMargin)} (${PCT(fin.marginPct)})
COGS (custo dos ativos): ${BRL(fin.cogs)}
Burn Rate (compras pagas): ${BRL(fin.burnRate)} / R$300.000 (${PCT(fin.burnPct)})
Dias restantes no mês: ${fin.daysLeft} dias
Faturamento diário necessário: ${BRL(fin.dailyNeed)}/dia
Vendas entregues: ${fin.salesCount} | Ticket médio: ${BRL(fin.ticketMedio)}
Vendas pagas aguardando fornecedor >48h: ${fin.overdueSales} OS BLOQUEADAS

--- ESTOQUE ---
Ativos disponíveis para venda: ${stock.available} unidades
Valor potencial disponível: ${BRL(stock.totalSaleValueAvailable)} (margem potencial: ${BRL(stock.potentialMargin)})
Em triagem: ${stock.triagem} | Vendidos: ${stock.sold}

--- PIPELINE DE ORDENS ---
${Object.entries(pipeline).map(([s, c]) => `${s}: ${c}`).join(' | ') || 'Sem ordens ativas'}

--- TOP FORNECEDORES (por rating) ---
${vendors.map((v, i) => `${i + 1}. ${v.name} — Rating: ${v.rating}/10 — Categoria: ${v.category ?? 'N/A'}`).join('\n')}

--- TAREFAS CEO PRIORITÁRIAS ---
${tasks.map((t, i) => `${i + 1}. [${t.category}] Score ${t.priorityScore} — ${t.title}${t.revenueImpact ? ` (impacto estimado: ${BRL(Number(t.revenueImpact))})` : ''}`).join('\n')}

--- MEMÓRIAS E CONTEXTO RECENTE ---
${memories.length === 0 ? 'Nenhuma memória salva ainda.' : memories.map((m) => `[${m.type}] ${m.title ?? ''}: ${m.content.slice(0, 200)}`).join('\n')}

=== REGRAS DE COMPORTAMENTO ===
- Sempre cite DADOS REAIS do ERP nas respostas, nunca invente números.
- Se o CEO sugerir contratar alguém, proponha PRIMEIRO uma solução via automação/código.
- Cada resposta deve terminar com uma linha "🎯 PRÓXIMO PASSO:" com 1 ação concreta e mensurável.
- Para análise de tarefas: retorne JSON estruturado com { verdict, justificativa, techSuggestion, revenueImpact, quadrante }.
- Seja direto. Máximo 3 parágrafos por resposta. CEO não tem tempo para textão.
- Sempre converta impactos em % da meta de R$1M.`
}

// ─── Tipagens exportadas ──────────────────────────────────────────────────────

export type AlfredoVerdict = 'EXECUTAR_AGORA' | 'AUTOMATIZAR' | 'DELEGAR' | 'ELIMINAR'

export type TaskAnalysisResult = {
  verdict:       AlfredoVerdict
  justificativa: string
  techSuggestion: string | null
  revenueImpact:  string
  quadrante:      1 | 2 | 3 | 4
  scoreAjustado?: number
}
