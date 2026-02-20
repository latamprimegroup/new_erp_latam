import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { getMetaEngine } from '@/lib/g2-agent'

/**
 * GET - Motor de meta: produção atual, projeção, ritmo necessário
 * Query: producerId (opcional — se omitido, considera todos)
 */
export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const producerId = searchParams.get('producerId') || undefined

  const meta = await getMetaEngine(producerId)
  return NextResponse.json(meta)
}
