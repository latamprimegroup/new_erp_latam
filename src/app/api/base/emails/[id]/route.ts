import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'
import { audit } from '@/lib/audit'

const patchSchema = z.object({
  email: z.string().email().optional(),
  recovery: z.string().optional().nullable(),
  passwordPlain: z.string().optional(),
  status: z.enum(['AVAILABLE', 'DISABLED']).optional(),
  supplierId: z.string().optional().nullable(),
  countryId: z.string().optional().nullable(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response
  const session = auth.session

  const { id } = await params
  const existing = await prisma.email.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'E-mail não encontrado' }, { status: 404 })

  try {
    const body = await req.json()
    const data = patchSchema.parse(body)

    const update: Record<string, unknown> = {}
    if (data.email !== undefined && data.email !== existing.email) {
      const taken = await prisma.email.findUnique({ where: { email: data.email } })
      if (taken) return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 400 })
      update.email = data.email
    }
    if (data.recovery !== undefined) update.recovery = data.recovery
    if (data.status !== undefined) update.status = data.status
    if (data.supplierId !== undefined) update.supplierId = data.supplierId
    if (data.countryId !== undefined) update.countryId = data.countryId
    if (data.passwordPlain !== undefined && data.passwordPlain.trim() !== '') {
      update.passwordPlain = encrypt(data.passwordPlain.trim())
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
    }

    const email = await prisma.email.update({
      where: { id },
      data: update,
    })

    await audit({
      userId: session.user.id,
      action: 'base_email_updated',
      entity: 'Email',
      entityId: id,
      details: { fields: Object.keys(update).filter((k) => k !== 'passwordPlain') },
    })

    const { passwordPlain, passwordHash, ...rest } = email
    return NextResponse.json({
      ...rest,
      passwordPlain: passwordPlain ? '••••••••' : null,
      passwordHash: passwordHash ? '••••••••' : null,
    })
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
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response
  const session = auth.session

  const { id } = await params
  const email = await prisma.email.findUnique({
    where: { id },
    include: { productionAccount: { select: { id: true } }, productionG2: { select: { id: true } } },
  })
  if (!email) return NextResponse.json({ error: 'E-mail não encontrado' }, { status: 404 })

  if (email.status !== 'AVAILABLE') {
    return NextResponse.json(
      { error: 'Só é possível excluir itens com status Disponível. Itens reservados ou usados não podem ser removidos.' },
      { status: 400 }
    )
  }
  if (email.assignedToProducerId) {
    return NextResponse.json(
      { error: 'Libere a reserva do produtor antes de excluir este e-mail.' },
      { status: 400 }
    )
  }
  if (email.accountId || email.productionAccount || email.productionG2) {
    return NextResponse.json(
      { error: 'Este e-mail está vinculado a uma conta ou produção. Não pode ser excluído.' },
      { status: 400 }
    )
  }

  await prisma.email.delete({ where: { id } })

  await audit({
    userId: session.user.id,
    action: 'base_email_deleted',
    entity: 'Email',
    entityId: id,
    details: { email: email.email },
  })

  return NextResponse.json({ ok: true })
}
