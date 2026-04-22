import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = ['ADMIN', 'PRODUCTION_MANAGER'] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireRoles([...ALLOWED_ROLES])
  if (!auth.ok) return auth.response

  const { id } = params
  const body = await req.json()
  const { action } = body // 'confirmar' | 'cancelar'

  const entry = await prisma.purchaseEntry.findUnique({ where: { id } })
  if (!entry) return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
  if (entry.status !== 'PENDENTE') {
    return NextResponse.json({ error: 'Apenas entradas PENDENTES podem ser alteradas' }, { status: 400 })
  }

  if (action === 'confirmar') {
    const updated = await prisma.purchaseEntry.update({
      where: { id },
      data: { status: 'CONFIRMADA', confirmedAt: new Date() },
      include: { items: true, supplier: { select: { id: true, name: true } } },
    })
    return NextResponse.json(updated)
  }

  if (action === 'cancelar') {
    const updated = await prisma.purchaseEntry.update({
      where: { id },
      data: { status: 'CANCELADA' },
      include: { items: true, supplier: { select: { id: true, name: true } } },
    })
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: 'Ação inválida. Use "confirmar" ou "cancelar"' }, { status: 400 })
}
