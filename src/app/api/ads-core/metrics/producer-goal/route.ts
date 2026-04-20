import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

/** Meta mensal/diária do produtor (tabela Goal), para header da esteira ADS CORE. */
export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (auth.session.user.role !== 'PRODUCER') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const now = new Date()
  const goal = await prisma.goal.findFirst({
    where: {
      userId: auth.session.user.id,
      status: 'active',
      periodStart: { lte: now },
      periodEnd: { gte: now },
    },
    orderBy: { periodStart: 'desc' },
  })

  return NextResponse.json({
    hasGoal: !!goal,
    productionCurrent: goal?.productionCurrent ?? 0,
    monthlyTarget: goal?.monthlyTarget ?? null,
    dailyTarget: goal?.dailyTarget ?? null,
  })
}
