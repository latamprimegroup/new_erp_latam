import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

function canAdsCoreAdmin(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

const ADS_CORE_ACTION_PREFIX = 'ads_core_'

/**
 * Lista paginada (somente leitura) — logs imutáveis; otimizada com índices em entity + createdAt.
 */
export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!canAdsCoreAdmin(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const assetId = searchParams.get('assetId')?.trim() || undefined
  const cursor = searchParams.get('cursor')?.trim() || undefined
  const limitRaw = Number(searchParams.get('limit') || '40')
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 40

  const where = {
    entity: 'AdsCoreAsset',
    action: { startsWith: ADS_CORE_ACTION_PREFIX },
    ...(assetId ? { entityId: assetId } : {}),
  } as const

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor
      ? {
          skip: 1,
          cursor: { id: cursor },
        }
      : {}),
    select: {
      id: true,
      userId: true,
      action: true,
      entityId: true,
      details: true,
      ip: true,
      createdAt: true,
    },
  })

  let nextCursor: string | null = null
  let items = rows
  if (rows.length > limit) {
    items = rows.slice(0, limit)
    nextCursor = items[items.length - 1]?.id ?? null
  }

  const userIds = [...new Set(items.map((r) => r.userId).filter(Boolean))] as string[]
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : []
  const userMap = new Map(users.map((u) => [u.id, (u.name || u.email || u.id).trim()]))

  return NextResponse.json({
    items: items.map((r) => ({
      id: r.id,
      userId: r.userId,
      userLabel: r.userId ? userMap.get(r.userId) || r.userId : null,
      action: r.action,
      assetId: r.entityId,
      details: r.details,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor,
  })
}
