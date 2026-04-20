import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

/**
 * PATCH — Associa ou remove UNI de um lote (Módulo 4).
 * Body: { warmupLotId: string | null }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id: unitId } = await params
  if (!unitId) {
    return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  }

  let body: { warmupLotId?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const warmupLotId =
    body.warmupLotId === null || body.warmupLotId === ''
      ? null
      : typeof body.warmupLotId === 'string'
        ? body.warmupLotId.trim()
        : undefined

  if (warmupLotId === undefined) {
    return NextResponse.json({ error: 'warmupLotId obrigatório (ou null para limpar)' }, { status: 400 })
  }

  const unit = await prisma.vaultIndustrialUnit.findUnique({ where: { id: unitId } })
  if (!unit) {
    return NextResponse.json({ error: 'UNI não encontrada' }, { status: 404 })
  }

  if (warmupLotId) {
    const lot = await prisma.warmupLot.findUnique({ where: { id: warmupLotId } })
    if (!lot) {
      return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 })
    }
  }

  const updated = await prisma.vaultIndustrialUnit.update({
    where: { id: unitId },
    data: { warmupLotId },
    select: { id: true, warmupLotId: true, status: true },
  })

  return NextResponse.json({ ok: true, unit: updated })
}
