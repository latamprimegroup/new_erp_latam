import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'PRODUCTION_MANAGER']

const patchSchema = z.object({
  itemId:        z.string(),
  physicalStock: z.number().int().min(0),
  reason: z.enum([
    'AJUSTE_POSITIVO','AJUSTE_NEGATIVO','QUEBRA_TECNICA',
    'ERRO_LANCAMENTO','PERDA_EXTRAVIO','ENTRADA_FORNECEDOR',
  ]).optional(),
  notes: z.string().max(500).optional(),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const check = await prisma.inventoryCheck.findUnique({ where: { id: params.id } })
  if (!check) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (check.status !== 'ABERTO')
    return NextResponse.json({ error: 'Inventário não está aberto para edição' }, { status: 409 })
  if (session.user.role === 'PRODUCTION_MANAGER' && check.managerId !== session.user.id)
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const { itemId, physicalStock, reason, notes } = parsed.data

  const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, checkId: params.id } })
  if (!item) return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 })

  const difference = physicalStock - item.systemStock

  const updated = await prisma.inventoryItem.update({
    where: { id: itemId },
    data: {
      physicalStock,
      difference,
      reason: reason ?? null,
      notes: notes ?? null,
    },
  })

  return NextResponse.json(updated)
}
