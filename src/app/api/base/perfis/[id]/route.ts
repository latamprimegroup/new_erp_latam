import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const patchSchema = z.object({
  type: z.string().min(1).optional(),
  gateway: z.string().min(1).optional(),
  status: z.enum(['AVAILABLE', 'DISABLED']).optional(),
  cnpjId: z.string().optional().nullable(),
  countryId: z.string().optional().nullable(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params
  const existing = await prisma.paymentProfile.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

  try {
    const body = await req.json()
    const data = patchSchema.parse(body)

    const update: Record<string, unknown> = {}
    if (data.type !== undefined) update.type = data.type
    if (data.gateway !== undefined) update.gateway = data.gateway
    if (data.status !== undefined) update.status = data.status
    if (data.cnpjId !== undefined) update.cnpjId = data.cnpjId
    if (data.countryId !== undefined) update.countryId = data.countryId

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
    }

    const perfil = await prisma.paymentProfile.update({
      where: { id },
      data: update,
      include: {
        cnpj: { select: { cnpj: true, razaoSocial: true } },
        account: { select: { id: true, platform: true } },
      },
    })

    await audit({
      userId: session.user.id,
      action: 'base_perfil_updated',
      entity: 'PaymentProfile',
      entityId: id,
      details: { fields: Object.keys(update) },
    })

    return NextResponse.json(perfil)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params
  const row = await prisma.paymentProfile.findUnique({
    where: { id },
    include: { productionAccount: { select: { id: true } }, productionG2: { select: { id: true } } },
  })
  if (!row) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

  if (row.status !== 'AVAILABLE') {
    return NextResponse.json(
      { error: 'Só é possível excluir perfis disponíveis.' },
      { status: 400 }
    )
  }
  if (row.assignedToProducerId) {
    return NextResponse.json({ error: 'Libere a reserva antes de excluir.' }, { status: 400 })
  }
  if (row.accountId || row.productionAccount || row.productionG2) {
    return NextResponse.json({ error: 'Perfil vinculado a conta ou produção.' }, { status: 400 })
  }

  await prisma.paymentProfile.delete({ where: { id } })

  await audit({
    userId: session.user.id,
    action: 'base_perfil_deleted',
    entity: 'PaymentProfile',
    entityId: id,
  })

  return NextResponse.json({ ok: true })
}
