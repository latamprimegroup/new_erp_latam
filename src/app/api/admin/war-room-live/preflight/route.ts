import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const auth = await requireRoles(['ADMIN', 'COMMERCIAL', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const rows = await prisma.campaignPreflightReview.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      client: { include: { user: { select: { email: true, name: true } } } },
      ticket: { select: { ticketNumber: true, status: true } },
    },
  })

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      status: r.status,
      campaignUrl: r.campaignUrl,
      notes: r.notes,
      checklistJson: r.checklistJson,
      analystNotes: r.analystNotes,
      ticketNumber: r.ticket?.ticketNumber,
      ticketStatus: r.ticket?.status,
      clientEmail: r.client.user.email,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}
