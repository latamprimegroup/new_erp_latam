import { NextResponse } from 'next/server'
import { TrackerTrafficSourceStatus } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  countActiveBlueprintSlots,
  normalizeBlueprint,
  normalizeGlobalParams,
} from '@/lib/ads-tracker/traffic-source-types'

const WRITE_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const
const READ_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

function statusOk(s: string): s is TrackerTrafficSourceStatus {
  return s === 'ACTIVE' || s === 'PAUSED'
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...READ_ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const row = await prisma.trackerTrafficSource.findUnique({ where: { id } })
  if (!row) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const bp = normalizeBlueprint(row.paramBlueprint)
  const gp = normalizeGlobalParams(row.globalParams)

  return NextResponse.json({
    source: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      networkKind: row.networkKind,
      builtIn: row.builtIn,
      paramBlueprint: bp,
      globalParams: gp,
      activeParamCount: countActiveBlueprintSlots(bp, gp),
      updatedAt: row.updatedAt.toISOString(),
    },
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...WRITE_ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const prev = await prisma.trackerTrafficSource.findUnique({ where: { id } })
  if (!prev) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  let body: {
    name?: string
    status?: string
    networkKind?: string
    paramBlueprint?: unknown
    globalParams?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}

  if (typeof body.name === 'string') {
    const n = body.name.trim().slice(0, 200)
    if (n) data.name = n
  }
  if (typeof body.status === 'string' && statusOk(body.status)) data.status = body.status
  if (!prev.builtIn && typeof body.networkKind === 'string' && body.networkKind.trim()) {
    data.networkKind = body.networkKind.trim().slice(0, 32)
  }
  if (body.paramBlueprint !== undefined) {
    data.paramBlueprint = normalizeBlueprint(body.paramBlueprint) as object
  }
  if (body.globalParams !== undefined) {
    data.globalParams = normalizeGlobalParams(body.globalParams) as object
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Sem alterações' }, { status: 400 })
  }

  await prisma.trackerTrafficSource.update({ where: { id }, data: data as object })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...WRITE_ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const prev = await prisma.trackerTrafficSource.findUnique({ where: { id } })
  if (!prev) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (prev.builtIn) {
    return NextResponse.json({ error: 'Fonte integrada não pode ser eliminada' }, { status: 403 })
  }

  await prisma.trackerTrafficSource.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
