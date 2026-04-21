/**
 * Seed — Tarefas Iniciais do CEO Command Center (Road to R$1M)
 * Executar: node scripts/seed-ceo-tasks.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const calcScore = (impact, urgency) => impact * 2 + urgency
const calcPriority = (score) => score >= 25 ? 'CRITICAL' : score >= 18 ? 'HIGH' : score >= 12 ? 'MEDIUM' : 'LOW'

const TASKS = [
  // ── ESCALA — Faturamento Direto ──────────────────────────────────────────
  {
    title:         'Analisar ROI por canal e alocar R$300k para máximo retorno',
    description:   'Mapear ROAS por canal (Meta, Google, TikTok). Identificar os top 3 canais com melhor retorno e realocar verba. Meta: identificar onde R$300k viram R$1M.',
    category:      'ESCALA',
    impact:        10,
    urgency:       10,
    revenueImpact: 700000,
  },
  {
    title:         'Criar pipeline de vendas estruturado para os 14 ativos Google Ads',
    description:   'Montar funil: comunidades → consulta de preço (ID) → OS → pagamento. Meta: vender 100% do lote João Titanium em 30 dias.',
    category:      'ESCALA',
    impact:        9,
    urgency:       9,
    revenueImpact: 40409,
  },
  {
    title:         'Lançar campanha de divulgação do catálogo Titanium nas comunidades',
    description:   'Usar o Catálogo do Dia gerado pelo ERP. Template VIP para grupos exclusivos, Fire para grupos abertos. Postar os 14 IDs com authority tags.',
    category:      'ESCALA',
    impact:        8,
    urgency:       10,
    revenueImpact: 30000,
  },
  {
    title:         'Definir metas agressivas de vendas para o time comercial',
    description:   'Meta por vendedor: mínimo 3 OS/semana. Criar ranking interno visível no ERP (BI & Margem → Top Vendedores). Vincular bônus ao scorecard.',
    category:      'ESCALA',
    impact:        9,
    urgency:       8,
    revenueImpact: 120000,
  },
  {
    title:         'Expandir catálogo de ativos: negociar lote 2 com João Titanium',
    description:   'Com o CNPJ validado e contrato de fornecimento ativo, negociar lote de 50+ ativos com desconto de volume. Meta: reduzir custo unitário de R$450 para R$350.',
    category:      'ESCALA',
    impact:        8,
    urgency:       7,
    revenueImpact: 200000,
  },

  // ── EFICIÊNCIA — Margem e Custo ──────────────────────────────────────────
  {
    title:         'Auditar os 5 principais fornecedores por Health Score e margem real',
    description:   'Usar o BI do ERP (aba BI & Margem) para ranquear fornecedores. Eliminar fornecedores com taxa de falha > 10% e Health Score < 10. Renegociar com os Tier 1.',
    category:      'EFICIENCIA',
    impact:        9,
    urgency:       8,
    revenueImpact: 50000,
  },
  {
    title:         'Confirmar pagamento ao João Titanium (PO pendente — 14 ativos)',
    description:   'Acessar /dashboard/compras → Ordens de Compra → confirmar PIX à Titanium Mercado Digital LTDA (CNPJ 54.424.637/0001-34). Isso libera os ativos para entrega.',
    category:      'EFICIENCIA',
    impact:        10,
    urgency:       10,
    revenueImpact: 40409,
  },
  {
    title:         'Implementar contrato de fornecimento com cláusula de reposição',
    description:   'Toda conta entregue com bloqueio em 48h = reposição automática do fornecedor. Formalizar via contrato e registrar no ERP (notas do fornecedor).',
    category:      'EFICIENCIA',
    impact:        8,
    urgency:       7,
    revenueImpact: 30000,
  },
  {
    title:         'Ajustar markups no lote Titanium com base na demanda real',
    description:   'Contas com Ano < 2015 (vintage) têm maior valor percebido. Ajustar salePrice das HS para +15% e verificar se floor ainda sustenta margem mínima de 20%.',
    category:      'EFICIENCIA',
    impact:        7,
    urgency:       6,
    revenueImpact: 8000,
  },

  // ── INFRA — Tech e Automação ─────────────────────────────────────────────
  {
    title:         'Finalizar integração Comercial → Financeiro no ERP',
    description:   'Verificar fluxo completo: OS criada → cliente paga → notifica financeiro → fornecedor pago → credenciais liberadas → baixa de estoque. Testar com ativo real.',
    category:      'INFRA',
    impact:        8,
    urgency:       9,
    revenueImpact: 0,
  },
  {
    title:         'Configurar alertas automáticos de CAC e Burn Rate no Command Center',
    description:   'O sistema já cria tarefas automáticas quando CAC > 10% da meta ou Burn Rate > 80% do teto. Validar os thresholds com os dados reais do mês.',
    category:      'INFRA',
    impact:        7,
    urgency:       6,
    revenueImpact: 0,
  },
  {
    title:         'Automatizar copy diária de catálogo para WhatsApp/Telegram',
    description:   'Configurar rotina: todo dia às 09h, gerar lista dos ativos disponíveis e notificar via bot. Usar API /api/compras/ativos/catalogo?format=telegram&template=fire',
    category:      'INFRA',
    impact:        7,
    urgency:       5,
    revenueImpact: 15000,
  },

  // ── GESTÃO — Pessoas e Financeiro ────────────────────────────────────────
  {
    title:         'Alinhar sócios sobre meta R$1M e definir OKRs do trimestre',
    description:   'Reunião estratégica com sócios para apresentar o Road to 1M. Definir KRs: volume de ativos, margem % e número de vendedores ativos.',
    category:      'GESTAO',
    impact:        8,
    urgency:       7,
    revenueImpact: 0,
  },
  {
    title:         'Contratar 2 vendedores para o setor comercial (role: COMMERCIAL)',
    description:   'Com o ERP maturado e o sistema de OS funcionando, escalar o time comercial para aumentar volume de consultas e fechamentos por semana.',
    category:      'GESTAO',
    impact:        9,
    urgency:       7,
    revenueImpact: 150000,
  },
]

async function main() {
  console.log('🚀 Seed — CEO Command Center Tasks (Road to R$1M)\n')

  let created = 0; let skipped = 0

  for (const task of TASKS) {
    const exists = await prisma.ceoTask.findFirst({ where: { title: task.title } })
    if (exists) { skipped++; continue }

    const score    = calcScore(task.impact, task.urgency)
    const priority = calcPriority(score)

    await prisma.ceoTask.create({
      data: {
        title:         task.title,
        description:   task.description,
        category:      task.category,
        impact:        task.impact,
        urgency:       task.urgency,
        priorityScore: score,
        priority,
        revenueImpact: task.revenueImpact > 0 ? task.revenueImpact : undefined,
        status:        'TODO',
      },
    })

    const flag = priority === 'CRITICAL' ? '🚨' : priority === 'HIGH' ? '🔥' : '📋'
    console.log(`  ${flag} [${task.category.padEnd(10)}] Score ${score} — ${task.title.slice(0, 60)}`)
    created++
  }

  console.log(`\n✅ ${created} tarefas criadas | ⏭️  ${skipped} ignoradas (já existiam)`)
  console.log(`\n📊 Distribuição por categoria:`)

  const stats = await prisma.ceoTask.groupBy({ by: ['category'], _count: true })
  stats.forEach((s) => console.log(`   ${s.category}: ${s._count} tarefas`))

  const critical = await prisma.ceoTask.count({ where: { priority: 'CRITICAL' } })
  const high     = await prisma.ceoTask.count({ where: { priority: 'HIGH' } })
  console.log(`\n🔴 CRITICAL: ${critical} | 🔥 HIGH: ${high}`)
  console.log(`\n🎯 Acesse /dashboard/ceo para ver o Command Center.\n`)
}

main()
  .catch((e) => { console.error('❌ Erro:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
