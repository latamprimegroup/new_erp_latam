import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { getProducerRanking } from '@/lib/g2-agent'

/**
 * GET - Ranking de produtores por produção no mês
 */
export async function GET() {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response

  const ranking = await getProducerRanking()
  return NextResponse.json({ ranking })
}
