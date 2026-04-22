/**
 * GET /api/socio/runway
 * Calcula o Runway Pessoal e sugestões da ALFREDO IA:
 *   - Runway = patrimônio total / gasto mensal médio
 *   - Independence Score (0-100)
 *   - Target Wealth progress
 *   - Sugestão de retirada baseada no lucro da empresa
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'
import OpenAI               from 'openai'

function isAdmin(role?: string | null) { return role === 'ADMIN' }

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isAdmin(session.user.role))
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const profile = await prisma.socioProfile.findUnique({
    where:   { userId: session.user.id },
    include: { assets: true },
  })

  const profileId = profile?.id ?? '__none__'
  const now       = new Date()

  // ── Gasto médio mensal (últimos 3 meses) ─────────────────────────────────
  const m3 = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const expenses3m = await prisma.socioEntry.aggregate({
    where: { profileId, type: 'DESPESA', date: { gte: m3 } },
    _sum:  { amount: true },
  })
  const avgMonthlyExpense = Number(expenses3m._sum.amount ?? 0) / 3 || Number(profile?.monthlyExpenseGoal ?? 10000)

  // ── Patrimônio total ──────────────────────────────────────────────────────
  const totalPatrimonio = (profile?.assets ?? []).reduce((s, a) => s + Number(a.currentValue), 0)

  // ── Runway em meses ──────────────────────────────────────────────────────
  const runwayMonths = avgMonthlyExpense > 0 ? totalPatrimonio / avgMonthlyExpense : 999
  const runwayYears  = runwayMonths / 12

  // ── Independence Score ────────────────────────────────────────────────────
  // 0 = sem runway, 100 = 25+ anos de runway (FIRE)
  const independenceScore = Math.min(100, Math.round((runwayYears / 25) * 100))

  // ── Target Wealth Progress ────────────────────────────────────────────────
  const targetWealth   = Number(profile?.targetWealth ?? 0)
  const targetProgress = targetWealth > 0 ? Math.min(100, (totalPatrimonio / targetWealth) * 100) : null
  const yearsToTarget  = targetWealth > 0 && totalPatrimonio < targetWealth
    ? null // calculado abaixo
    : null

  // ── Lucro da empresa no último mês (para sugestão de retirada) ───────────
  const mStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const mEnd   = new Date(now.getFullYear(), now.getMonth(), 1)
  const [companyIncome, companyExpense] = await Promise.all([
    prisma.financialEntry.aggregate({ where: { type: 'INCOME', date: { gte: mStart, lt: mEnd } }, _sum: { value: true } }),
    prisma.financialEntry.aggregate({ where: { type: 'EXPENSE', date: { gte: mStart, lt: mEnd } }, _sum: { value: true } }),
  ])
  const companyProfit = Number(companyIncome._sum.value ?? 0) - Number(companyExpense._sum.value ?? 0)

  // ── Histórico mensal pessoal (6 meses) ───────────────────────────────────
  const monthlyHistory: { month: string; income: number; expense: number; balance: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d    = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const dEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const [inc, exp] = await Promise.all([
      prisma.socioEntry.aggregate({ where: { profileId, type: 'RECEITA', date: { gte: d, lt: dEnd } }, _sum: { amount: true } }),
      prisma.socioEntry.aggregate({ where: { profileId, type: 'DESPESA', date: { gte: d, lt: dEnd } }, _sum: { amount: true } }),
    ])
    const income  = Number(inc._sum.amount ?? 0)
    const expense = Number(exp._sum.amount ?? 0)
    monthlyHistory.push({ month: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }), income, expense, balance: income - expense })
  }

  // ── Sugestão de retirada da ALFREDO IA ───────────────────────────────────
  let aiSuggestion: string | null = null
  const SAFE_WITHDRAWAL_RATE = 0.30 // Retira até 30% do lucro do mês
  const suggestedWithdrawal  = companyProfit > 0 ? companyProfit * SAFE_WITHDRAWAL_RATE : 0

  const apiKey = process.env.OPENAI_API_KEY
  if (apiKey && companyProfit > 0) {
    try {
      const client = new OpenAI({ apiKey })
      const prompt = `Você é ALFREDO IA, assessor financeiro pessoal do sócio.
Dados:
- Patrimônio pessoal: R$ ${totalPatrimonio.toLocaleString('pt-BR')}
- Meta patrimonial: R$ ${targetWealth.toLocaleString('pt-BR')} (${(targetProgress ?? 0).toFixed(1)}% atingido)
- Gasto mensal médio: R$ ${avgMonthlyExpense.toLocaleString('pt-BR')}
- Runway: ${runwayYears.toFixed(1)} anos
- Lucro empresa mês anterior: R$ ${companyProfit.toLocaleString('pt-BR')}
- Sugestão base de retirada (30%): R$ ${suggestedWithdrawal.toLocaleString('pt-BR')}

Escreva UMA sugestão prática, objetiva e motivadora em português (máximo 2 frases). Sugira o valor ideal de retirada este mês e para onde alocar (ex: Tesouro Direto, CDB, ações). Seja direto como um gestor de patrimônio.`

      const r = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4, max_tokens: 150,
      })
      aiSuggestion = r.choices[0]?.message?.content ?? null
    } catch {
      aiSuggestion = `Este mês a Ads Ativos lucrou R$ ${companyProfit.toLocaleString('pt-BR')}. ALFREDO sugere retirar R$ ${suggestedWithdrawal.toLocaleString('pt-BR')} (30%) para aporte em renda fixa ou investimentos.`
    }
  } else if (companyProfit > 0) {
    aiSuggestion = `Este mês a Ads Ativos lucrou R$ ${companyProfit.toLocaleString('pt-BR')}. ALFREDO sugere retirar R$ ${suggestedWithdrawal.toLocaleString('pt-BR')} (30%) como distribuição de lucros para acelerar seu patrimônio pessoal.`
  }

  return NextResponse.json({
    runwayMonths:      Math.round(runwayMonths),
    runwayYears:       parseFloat(runwayYears.toFixed(1)),
    independenceScore,
    avgMonthlyExpense,
    totalPatrimonio,
    targetWealth,
    targetProgress,
    yearsToTarget,
    companyProfit,
    suggestedWithdrawal,
    aiSuggestion,
    monthlyHistory,
  })
}
