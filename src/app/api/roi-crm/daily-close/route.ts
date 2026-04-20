import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { getRoiDailyClose } from '@/lib/roi-crm-queries'

const ROLES = ['ADMIN', 'FINANCE', 'COMMERCIAL']

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/**
 * Fechamento de um dia: faturamento (pedidos) vs investimento lançado — base para conferência de caixa.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const { date } = schema.parse(await req.json())
    const d = await getRoiDailyClose(date)
    return NextResponse.json({
      date,
      faturamento: d.revenue,
      investimento: d.spend,
      net: d.net,
      pedidos: d.ordersCount,
      nota: d.timezoneNote,
    })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message }, { status: 400 })
    }
    throw e
  }
}
