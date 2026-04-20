import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/api-auth'

const ROLES = ['ADMIN', 'FINANCE'] as const

/** GET — últimas ações auditadas (export, visualização de lead, etc.) */
export async function GET(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const take = Math.min(200, parseInt(url.searchParams.get('take') || '80', 10) || 80)

  const rows = await prisma.commercialDataAuditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      userId: true,
      role: true,
      action: true,
      entityType: true,
      entityId: true,
      metadata: true,
      createdAt: true,
      user: { select: { email: true, name: true } },
    },
  })

  return NextResponse.json({
    count: rows.length,
    rows: rows.map((r) => ({
      id: r.id,
      userEmail: r.user.email,
      userName: r.user.name,
      role: r.role,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}
