import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { getG2PaceTrend } from '@/lib/g2-agent'

/**
 * GET — Série de 14 dias de contas validadas (produção + G2) para gráfico de tendência.
 * Query: producerId (opcional). Produtor costuma usar o próprio id; gestão omite para visão global.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response

  const producerId = new URL(req.url).searchParams.get('producerId') || undefined
  const session = auth.session
  if (session.user.role === 'PRODUCER' && producerId && producerId !== session.user.id) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const scoped = session.user.role === 'PRODUCER' ? session.user.id : producerId
  const trend = await getG2PaceTrend(scoped)
  return NextResponse.json(trend)
}
