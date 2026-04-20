import { NextResponse } from 'next/server'
import { WarmupLotStatus } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
}

/**
 * GET — Lista lotes (Módulo 4).
 */
export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const lots = await prisma.warmupLot.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { units: true } } },
  })

  return NextResponse.json({
    lots: lots.map((l) => ({
      id: l.id,
      name: l.name,
      nicheTag: l.nicheTag,
      status: l.status,
      internalMaturityPct: l.internalMaturityPct,
      notes: l.notes,
      unitCount: l._count.units,
      updatedAt: l.updatedAt.toISOString(),
    })),
  })
}

/**
 * POST — Cria lote.
 * Body: { name, nicheTag?, status?, internalMaturityPct?, notes? }
 */
export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: {
    name?: string
    nicheTag?: string | null
    status?: string
    internalMaturityPct?: number
    notes?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''
  if (!name) {
    return NextResponse.json({ error: 'name obrigatório' }, { status: 400 })
  }

  const nicheTag =
    typeof body.nicheTag === 'string' ? body.nicheTag.trim().slice(0, 120) || null : null
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 8000) || null : null

  let status: WarmupLotStatus = WarmupLotStatus.PLANNING
  if (body.status && Object.values(WarmupLotStatus).includes(body.status as WarmupLotStatus)) {
    status = body.status as WarmupLotStatus
  }

  const internalMaturityPct = clampPct(
    typeof body.internalMaturityPct === 'number' ? body.internalMaturityPct : 0
  )

  const row = await prisma.warmupLot.create({
    data: { name, nicheTag, status, internalMaturityPct, notes },
  })

  return NextResponse.json({
    lot: {
      id: row.id,
      name: row.name,
      nicheTag: row.nicheTag,
      status: row.status,
      internalMaturityPct: row.internalMaturityPct,
      notes: row.notes,
      unitCount: 0,
    },
  })
}
