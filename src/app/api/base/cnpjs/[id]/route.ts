import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const patchSchema = z.object({
  cnpj: z.string().min(14).optional(),
  razaoSocial: z.string().optional().nullable(),
  nomeFantasia: z.string().optional().nullable(),
  cnae: z.string().optional().nullable(),
  cnaeDescricao: z.string().optional().nullable(),
  status: z.enum(['AVAILABLE', 'DISABLED']).optional(),
  countryId: z.string().optional().nullable(),
  nicheId: z.string().optional().nullable(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params
  const existing = await prisma.cnpj.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'CNPJ não encontrado' }, { status: 404 })

  try {
    const body = await req.json()
    const data = patchSchema.parse(body)

    const update: Record<string, unknown> = {}
    if (data.razaoSocial !== undefined) update.razaoSocial = data.razaoSocial
    if (data.nomeFantasia !== undefined) update.nomeFantasia = data.nomeFantasia
    if (data.cnae !== undefined) update.cnae = data.cnae
    if (data.cnaeDescricao !== undefined) update.cnaeDescricao = data.cnaeDescricao
    if (data.status !== undefined) update.status = data.status
    if (data.countryId !== undefined) update.countryId = data.countryId
    if (data.nicheId !== undefined) update.nicheId = data.nicheId

    if (data.cnpj !== undefined) {
      const clean = data.cnpj.replace(/\D/g, '')
      if (clean !== existing.cnpj) {
        const taken = await prisma.cnpj.findFirst({ where: { cnpj: clean, id: { not: id } } })
        if (taken) return NextResponse.json({ error: 'CNPJ já cadastrado' }, { status: 400 })
        update.cnpj = clean
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
    }

    const cnpj = await prisma.cnpj.update({ where: { id }, data: update })

    await audit({
      userId: session.user.id,
      action: 'base_cnpj_updated',
      entity: 'Cnpj',
      entityId: id,
      details: { fields: Object.keys(update) },
    })

    return NextResponse.json(cnpj)
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
  const row = await prisma.cnpj.findUnique({
    where: { id },
    include: { productionAccount: { select: { id: true } }, productionG2: { select: { id: true } } },
  })
  if (!row) return NextResponse.json({ error: 'CNPJ não encontrado' }, { status: 404 })

  if (row.status !== 'AVAILABLE') {
    return NextResponse.json(
      { error: 'Só é possível excluir CNPJs disponíveis. Itens reservados ou usados não podem ser removidos.' },
      { status: 400 }
    )
  }
  if (row.assignedToProducerId) {
    return NextResponse.json({ error: 'Libere a reserva antes de excluir.' }, { status: 400 })
  }
  if (row.accountId || row.productionAccount || row.productionG2) {
    return NextResponse.json({ error: 'CNPJ vinculado a conta ou produção. Não pode ser excluído.' }, { status: 400 })
  }

  const countProfiles = await prisma.paymentProfile.count({ where: { cnpjId: id } })
  if (countProfiles > 0) {
    return NextResponse.json(
      { error: 'Existem perfis de pagamento vinculados a este CNPJ. Remova-os antes.' },
      { status: 400 }
    )
  }

  await prisma.cnpj.delete({ where: { id } })

  await audit({
    userId: session.user.id,
    action: 'base_cnpj_deleted',
    entity: 'Cnpj',
    entityId: id,
    details: { cnpj: row.cnpj },
  })

  return NextResponse.json({ ok: true })
}
