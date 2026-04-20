import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { getMetaEngine } from '@/lib/g2-agent'
import { notifyIfCriticalG2Pace } from '@/lib/g2-meta-alerts'

/**
 * GET - Motor de meta: produção atual, projeção, ritmo necessário
 * Query: producerId (opcional — se omitido, considera todos)
 */
export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  let producerId = searchParams.get('producerId') || undefined
  if (auth.session.user?.role === 'PRODUCER') {
    producerId = auth.session.user.id
  }

  const meta = await getMetaEngine(producerId)

  /** Alerta operacional: visão global e apenas perfis de gestão (evita disparo a cada reload de produtor). */
  const oversight = ['ADMIN', 'FINANCE'].includes(auth.session.user?.role || '')
  if (!producerId && oversight) {
    notifyIfCriticalG2Pace(meta).catch((e) => console.error('G2 pace alert:', e))
  }

  return NextResponse.json(meta)
}
