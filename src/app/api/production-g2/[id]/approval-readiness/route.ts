import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getApprovalReadiness } from '@/lib/g2-agent'

/**
 * GET - Verifica se a conta pode ser aprovada (documentos obrigatórios, etc.)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response

  const { id } = await params
  const g2 = await prisma.productionG2.findFirst({
    where: { id, deletedAt: null },
  })
  if (!g2) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const readiness = await getApprovalReadiness(id)
  return NextResponse.json(readiness)
}
