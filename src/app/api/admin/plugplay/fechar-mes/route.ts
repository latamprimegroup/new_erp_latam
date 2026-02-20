import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { closeMonthForPlugPlay } from '@/lib/plugplay-payment'

const schema = z.object({
  collaboratorId: z.string().min(1),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020),
})

/**
 * Admin: fecha o mês para um colaborador Plug & Play
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { collaboratorId, month, year } = schema.parse(body)
    const statement = await closeMonthForPlugPlay(collaboratorId, month, year, session.user.id!)
    return NextResponse.json(statement)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
