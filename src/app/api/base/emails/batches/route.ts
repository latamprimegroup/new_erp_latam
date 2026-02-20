import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/base/emails/batches
 * Lista lotes de upload de e-mails (para rastreabilidade)
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const batches = await prisma.emailBatch.findMany({
    include: { supplier: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json(batches)
}
