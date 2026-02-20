import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getPaginationParams, paginatedResponse } from '@/lib/pagination'

export async function GET(req: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const entity = searchParams.get('entity')
  const format = searchParams.get('format')
  const { page, limit, skip } = getPaginationParams(searchParams)

  const where: Record<string, unknown> = {}
  if (userId) where.userId = userId
  if (entity) where.entity = entity

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ])

  if (format === 'csv') {
    const allLogs = await prisma.auditLog.findMany({
      where,
      take: 10000,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true } } },
    })
    const header = 'Data;Usuário;Ação;Entidade;ID;Valor Anterior;Valor Novo\n'
    const rows = allLogs.map(
      (l) =>
        `${new Date(l.createdAt).toISOString()};${l.user?.email || ''};${l.action};${l.entity};${l.entityId || ''};${l.oldValue ? JSON.stringify(l.oldValue) : ''};${l.newValue ? JSON.stringify(l.newValue) : ''}`
    )
    return new NextResponse(header + rows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename=auditoria.csv',
      },
    })
  }

  return NextResponse.json(paginatedResponse(logs, total, page, limit))
}
