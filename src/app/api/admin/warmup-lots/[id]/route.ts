import { NextResponse } from 'next/server'
import { WarmupLotStatus } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
}

/**
 * PATCH — Atualiza lote.
 * Body: parcial { name?, nicheTag?, status?, internalMaturityPct?, notes? }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const existing = await prisma.warmupLot.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 })
  }

  const data: {
    name?: string
    nicheTag?: string | null
    status?: WarmupLotStatus
    internalMaturityPct?: number
    notes?: string | null
  } = {}

  if (typeof body.name === 'string') {
    const n = body.name.trim().slice(0, 200)
    if (n) data.name = n
  }
  if (body.nicheTag === null) data.nicheTag = null
  else if (typeof body.nicheTag === 'string') {
    data.nicheTag = body.nicheTag.trim().slice(0, 120) || null
  }
  if (typeof body.status === 'string' && Object.values(WarmupLotStatus).includes(body.status as WarmupLotStatus)) {
    data.status = body.status as WarmupLotStatus
  }
  if (typeof body.internalMaturityPct === 'number') {
    data.internalMaturityPct = clampPct(body.internalMaturityPct)
  }
  if (body.notes === null) data.notes = null
  else if (typeof body.notes === 'string') {
    data.notes = body.notes.trim().slice(0, 8000) || null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
  }

  const row = await prisma.warmupLot.update({
    where: { id },
    data,
    include: { _count: { select: { units: true } } },
  })

  return NextResponse.json({
    lot: {
      id: row.id,
      name: row.name,
      nicheTag: row.nicheTag,
      status: row.status,
      internalMaturityPct: row.internalMaturityPct,
      notes: row.notes,
      unitCount: row._count.units,
    },
  })
}
