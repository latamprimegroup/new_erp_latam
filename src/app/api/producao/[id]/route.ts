import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const updateSchema = z.object({
  platform: z.enum(['GOOGLE_ADS', 'META_ADS', 'KWAI_ADS', 'TIKTOK_ADS', 'OTHER']).optional(),
  type: z.string().min(1).optional(),
  googleAdsCustomerId: z.string().optional().nullable(),
  currency: z.string().max(5).optional(),
  a2fCode: z.string().optional().nullable(),
  g2ApprovalCode: z.string().optional().nullable(),
  siteUrl: z.string().optional(),
  cnpjBizLink: z.string().optional(),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  cnpj: z.string().optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const roles = ['ADMIN', 'PRODUCER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const account = await prisma.productionAccount.findUnique({
    where: { id, deletedAt: null },
    include: { producer: true },
  })
  if (!account) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
  if (account.status !== 'PENDING') {
    return NextResponse.json({ error: 'Só é possível editar contas pendentes (em produção)' }, { status: 400 })
  }

  const isProducer = account.producerId === session.user.id
  if (!isProducer && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas o produtor ou admin pode editar' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    const updateData: Record<string, unknown> = {}
    if (data.platform) updateData.platform = data.platform
    if (data.type) updateData.type = data.type
    if (data.email !== undefined) updateData.email = data.email || null
    if (data.cnpj !== undefined) updateData.cnpj = data.cnpj ? data.cnpj.replace(/\D/g, '') : null
    if (data.googleAdsCustomerId !== undefined) {
      const digits = (data.googleAdsCustomerId || '').replace(/\D/g, '')
      updateData.googleAdsCustomerId = digits.length >= 10
        ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`
        : null
    }
    if (data.currency !== undefined) updateData.currency = data.currency
    if (data.a2fCode !== undefined) updateData.a2fCode = data.a2fCode || null
    if (data.g2ApprovalCode !== undefined) updateData.g2ApprovalCode = data.g2ApprovalCode || null
    if (data.siteUrl !== undefined) updateData.siteUrl = data.siteUrl || null
    if (data.cnpjBizLink !== undefined) updateData.cnpjBizLink = data.cnpjBizLink || null

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
    }

    const updated = await prisma.productionAccount.update({
      where: { id },
      data: updateData,
      include: { producer: { select: { name: true } } },
    })

    await audit({
      userId: session.user.id,
      action: 'production_updated',
      entity: 'ProductionAccount',
      entityId: id,
      details: { fields: Object.keys(updateData) },
    })

    return NextResponse.json(updated)
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

  const { id } = await params
  const roles = ['ADMIN', 'PRODUCER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const account = await prisma.productionAccount.findUnique({
    where: { id, deletedAt: null },
  })
  if (!account) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
  if (account.status !== 'PENDING') {
    return NextResponse.json({ error: 'Só é possível excluir contas pendentes (em produção)' }, { status: 400 })
  }

  const isProducer = account.producerId === session.user.id
  if (!isProducer && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas o produtor ou admin pode excluir' }, { status: 403 })
  }

  await prisma.productionAccount.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  await audit({
    userId: session.user.id,
    action: 'production_deleted',
    entity: 'ProductionAccount',
    entityId: id,
  })

  return NextResponse.json({ ok: true })
}
