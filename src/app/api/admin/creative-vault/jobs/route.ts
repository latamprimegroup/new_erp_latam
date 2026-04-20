import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const role = session.user?.role
  if (role !== 'ADMIN' && role !== 'COMMERCIAL' && role !== 'PRODUCTION_MANAGER') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const jobs = await prisma.creativeAgencyJob.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: {
      client: { include: { user: { select: { email: true, name: true } } } },
      template: { select: { title: true, niche: true } },
      ticket: { select: { ticketNumber: true } },
    },
  })

  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      iterationNumber: j.iterationNumber,
      checkoutUrl: j.checkoutUrl,
      hookNotes: j.hookNotes,
      logoUrl: j.logoUrl,
      deliverableUrl: j.deliverableUrl,
      uniqueMetadataHashDone: j.uniqueMetadataHashDone,
      ctrSnapshotAtDelivery: j.ctrSnapshotAtDelivery?.toNumber() ?? null,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
      clientEmail: j.client.user.email,
      clientName: j.client.user.name,
      templateTitle: j.template.title,
      templateNiche: j.template.niche,
      ticketNumber: j.ticket?.ticketNumber ?? null,
    })),
  })
}
