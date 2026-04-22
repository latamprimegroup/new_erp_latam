/**
 * GET /api/socio/distributable
 *
 * getDistributableBalance():
 *   Receita Bruta (3 meses médio)
 *   - Provisão de Impostos  (taxProvisionPct % da receita)
 *   - Despesas Fixas (média mensal × safetyBufferMonths)
 *   - Reinvestimento Mínimo (reinvestPct % do lucro bruto)
 *   - Fundo de Guerra
 *   = Saldo Distribuível ao Sócio
 *
 * Inclui sugestão da ALFREDO IA baseada no saldo.
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'
import OpenAI               from 'openai'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const now   = new Date()
  const m3ago = new Date(now.getFullYear(), now.getMonth() - 3, 1)

  // Configurações da empresa
  const cfg = await prisma.companyConfig.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } })

  // Receita bruta média dos últimos 3 meses
  const incomeAgg = await prisma.financialEntry.aggregate({
    where: { type: 'INCOME', date: { gte: m3ago } },
    _sum:  { value: true },
  })
  const totalIncome3m  = Number(incomeAgg._sum.value ?? 0)
  const avgMonthlyIncome = totalIncome3m / 3

  // Despesas fixas médias (últimos 3 meses)
  const expAgg = await prisma.financialEntry.aggregate({
    where: { type: 'EXPENSE', date: { gte: m3ago } },
    _sum:  { value: true },
  })
  const totalExpense3m   = Number(expAgg._sum.value ?? 0)
  const avgMonthlyExpense = totalExpense3m / 3

  // ── Hierarquia das reservas ──────────────────────────────────────────────
  const taxProvision      = avgMonthlyIncome * (Number(cfg.taxProvisionPct) / 100)
  const grossProfit       = avgMonthlyIncome - avgMonthlyExpense - taxProvision
  const safetyBuffer      = avgMonthlyExpense * cfg.safetyBufferMonths // 3 meses de despesas
  const warFund           = Number(cfg.warFundAmount)
  const reinvestReserve   = Math.max(0, grossProfit) * (Number(cfg.reinvestPct) / 100)

  // Saldo distribuível = lucro bruto - reservas mínimas
  const distributable = Math.max(0, grossProfit - reinvestReserve)

  // Saldo atual real do caixa (para comparar com reservas)
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const [incomeNow, expNow] = await Promise.all([
    prisma.financialEntry.aggregate({ where: { type: 'INCOME',  date: { gte: currentMonthStart } }, _sum: { value: true } }),
    prisma.financialEntry.aggregate({ where: { type: 'EXPENSE', date: { gte: currentMonthStart } }, _sum: { value: true } }),
  ])
  const currentBalance = Number(incomeNow._sum.value ?? 0) - Number(expNow._sum.value ?? 0)

  // Equity estimada (EBITDA anual × múltiplo)
  const annualEbitda    = Math.max(0, grossProfit) * 12
  const equityEstimate  = annualEbitda * cfg.ebitdaMultiple

  // ── Hierarquia visual das camadas ────────────────────────────────────────
  const layers = [
    { label: 'Reserva de Operação',     amount: safetyBuffer,    description: `${cfg.safetyBufferMonths}× despesas mensais — caixa mínimo da empresa`, level: 1, color: 'red' },
    { label: 'Provisão de Impostos',    amount: taxProvision,    description: `${cfg.taxProvisionPct}% da receita bruta`, level: 2, color: 'orange' },
    { label: 'Fundo de Guerra',         amount: warFund,         description: 'Reserva para oportunidades de aquisição', level: 3, color: 'amber' },
    { label: 'Reinvestimento Mínimo',   amount: reinvestReserve, description: `${cfg.reinvestPct}% do lucro bruto — capital de crescimento`, level: 4, color: 'yellow' },
    { label: 'Disponível para Sócios',  amount: distributable,   description: 'Excedente após todas as reservas — distribuível', level: 5, color: 'green' },
  ]

  // ── Sugestão da ALFREDO IA ────────────────────────────────────────────────
  let aiSuggestion: string | null = null
  const apiKey = process.env.OPENAI_API_KEY

  if (apiKey && distributable > 0) {
    try {
      const client = new OpenAI({ apiKey })
      const r = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        messages: [{ role: 'user', content: `Você é ALFREDO IA, assessor financeiro pessoal do sócio da Ads Ativos.
Dados do caixa:
- Receita média mensal: R$ ${avgMonthlyIncome.toLocaleString('pt-BR')}
- Despesa média mensal: R$ ${avgMonthlyExpense.toLocaleString('pt-BR')}
- Lucro bruto médio: R$ ${grossProfit.toLocaleString('pt-BR')}
- Reserva de operação (${cfg.safetyBufferMonths} meses): R$ ${safetyBuffer.toLocaleString('pt-BR')}
- Fundo de guerra: R$ ${warFund.toLocaleString('pt-BR')}
- Reinvestimento mínimo (${cfg.reinvestPct}%): R$ ${reinvestReserve.toLocaleString('pt-BR')}
- SALDO DISTRIBUÍVEL: R$ ${distributable.toLocaleString('pt-BR')}
- Equity estimada (${cfg.ebitdaMultiple}× EBITDA): R$ ${equityEstimate.toLocaleString('pt-BR')}

Escreva UMA sugestão estratégica em português, objetiva (máximo 3 frases). Sugira como alocar o saldo distribuível de R$ ${distributable.toLocaleString('pt-BR')} — qual % para retirada pessoal, qual % para reinvestimento, e onde investir o excedente pessoal. Tom direto de gestor de patrimônio.` }],
        temperature: 0.3, max_tokens: 200,
      })
      aiSuggestion = r.choices[0]?.message?.content ?? null
    } catch {
      aiSuggestion = `Caixa saudável! R$ ${distributable.toLocaleString('pt-BR')} disponível para distribuição. Sugestão: retire 70% (R$ ${(distributable * 0.7).toLocaleString('pt-BR')}) para sua holding pessoal e mantenha 30% como liquidez operacional.`
    }
  } else if (distributable > 0) {
    aiSuggestion = `Caixa saudável! R$ ${distributable.toLocaleString('pt-BR')} disponível para distribuição após todas as reservas. Considere retirar para sua holding pessoal ou reinvestir em ativos de alto retorno.`
  } else {
    aiSuggestion = `Caixa ainda em consolidação. Lucro bruto de R$ ${grossProfit.toLocaleString('pt-BR')} está sendo absorvido pelas reservas. Foque em aumentar a receita ou reduzir custos antes da próxima distribuição.`
  }

  return NextResponse.json({
    avgMonthlyIncome,
    avgMonthlyExpense,
    grossProfit,
    taxProvision,
    safetyBuffer,
    warFund,
    reinvestReserve,
    distributable,
    currentBalance,
    equityEstimate,
    annualEbitda,
    ebitdaMultiple:     cfg.ebitdaMultiple,
    layers,
    aiSuggestion,
    config: {
      safetyBufferMonths: cfg.safetyBufferMonths,
      warFundAmount:      Number(cfg.warFundAmount),
      taxProvisionPct:    Number(cfg.taxProvisionPct),
      reinvestPct:        Number(cfg.reinvestPct),
      ebitdaMultiple:     cfg.ebitdaMultiple,
      revenueTarget:      Number(cfg.revenueTarget),
    },
  })
}
