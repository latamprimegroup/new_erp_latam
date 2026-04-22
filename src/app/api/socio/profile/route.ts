/**
 * GET  /api/socio/profile — Retorna (ou cria) o perfil do sócio logado
 * PATCH /api/socio/profile — Atualiza metas patrimoniais
 *
 * Segurança: Apenas ADMIN pode acessar. Cada ADMIN vê apenas seus próprios dados.
 * FINANCE role: acesso BLOQUEADO (retorna 403).
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z }                from 'zod'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'

// Apenas sócios/admins — FINANCE explicitamente bloqueado
function guard(role?: string | null) {
  if (!role) return false
  if (role === 'FINANCE') return false // Véu corporativo
  return role === 'ADMIN'
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !guard(session.user.role))
    return NextResponse.json({ error: 'Acesso negado — área exclusiva dos sócios' }, { status: 403 })

  // Upsert do perfil: cria automaticamente na primeira visita
  let profile = await prisma.socioProfile.findUnique({
    where:   { userId: session.user.id },
    include: {
      assets:    { orderBy: { currentValue: 'desc' } },
      transfers: { orderBy: { date: 'desc' }, take: 10, include: { approvedBy: { select: { name: true } } } },
    },
  })

  if (!profile) {
    profile = await prisma.socioProfile.create({
      data:    { userId: session.user.id },
      include: { assets: true, transfers: { take: 10, include: { approvedBy: { select: { name: true } } } } },
    })
  }

  // Resumo financeiro pessoal
  const now     = new Date()
  const m30     = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())

  const [income30, expense30, totalIncome, totalExpense] = await Promise.all([
    prisma.socioEntry.aggregate({ where: { profileId: profile.id, type: 'RECEITA', date: { gte: m30 } }, _sum: { amount: true } }),
    prisma.socioEntry.aggregate({ where: { profileId: profile.id, type: 'DESPESA', date: { gte: m30 } }, _sum: { amount: true } }),
    prisma.socioEntry.aggregate({ where: { profileId: profile.id, type: 'RECEITA' }, _sum: { amount: true } }),
    prisma.socioEntry.aggregate({ where: { profileId: profile.id, type: 'DESPESA' }, _sum: { amount: true } }),
  ])

  const totalPatrimonio = profile.assets.reduce((s, a) => s + Number(a.currentValue), 0)
  const monthlyIncome   = Number(income30._sum.amount  ?? 0)
  const monthlyExpense  = Number(expense30._sum.amount ?? 0)
  const netSavings      = Number(totalIncome._sum.amount ?? 0) - Number(totalExpense._sum.amount ?? 0)
  const targetProgress  = profile.targetWealth ? (totalPatrimonio / Number(profile.targetWealth)) * 100 : null

  return NextResponse.json({
    profile,
    summary: {
      totalPatrimonio,
      monthlyIncome,
      monthlyExpense,
      monthlyBalance: monthlyIncome - monthlyExpense,
      netSavings,
      targetProgress,
      targetWealth: Number(profile.targetWealth ?? 0),
    },
    user: { name: session.user.name, email: session.user.email },
  })
}

const patchSchema = z.object({
  targetWealth:       z.number().positive().optional(),
  monthlyExpenseGoal: z.number().positive().optional(),
  notes:              z.string().max(2000).optional(),
})

export async function PATCH(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !guard(session.user.role))
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })

  const profile = await prisma.socioProfile.upsert({
    where:  { userId: session.user.id },
    update: parsed.data,
    create: { userId: session.user.id, ...parsed.data },
  })

  return NextResponse.json(profile)
}
