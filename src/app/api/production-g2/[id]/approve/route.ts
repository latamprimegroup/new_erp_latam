import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { getApprovalReadiness } from '@/lib/g2-agent'
import { notifyAdminsProductionApproved } from '@/lib/notifications/admin-events'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN', 'FINANCE'])
  if (!auth.ok) return auth.response
  const session = auth.session

  const { id } = await params
  const g2 = await prisma.productionG2.findFirst({ where: { id, deletedAt: null } })
  if (!g2) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const readiness = await getApprovalReadiness(id)
  if (!readiness.canApprove) {
    return NextResponse.json(
      { error: 'Aprovação bloqueada', blockers: readiness.blockers, missingDocs: readiness.missingDocs },
      { status: 400 }
    )
  }

  const updated = await prisma.productionG2.update({
    where: { id },
    data: {
      status: 'APROVADA',
      approvedAt: new Date(),
      rejectedAt: null,
      rejectedReason: null,
    },
    include: {
      creator: { select: { name: true } },
      client: { include: { user: { select: { name: true } } } },
    },
  })

  await prisma.productionG2Log.create({
    data: {
      productionG2Id: id,
      userId: session.user!.id,
      action: 'APPROVE',
    },
  })

  await audit({
    userId: session.user!.id,
    action: 'production_g2_approved',
    entity: 'ProductionG2',
    entityId: id,
    details: { codeG2: g2.codeG2 },
  })

  notifyAdminsProductionApproved(updated.codeG2, updated.creator?.name ?? null).catch(console.error)

  return NextResponse.json(updated)
}
