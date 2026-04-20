import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  extractCnpjFromLink,
  isCnpjInUse,
  isGoogleAdsIdInUse,
  maskCredential,
} from '@/lib/production-g2'
import { validateTransition, PRODUCTION_G2_TRANSITIONS } from '@/lib/state-machine'
import { audit } from '@/lib/audit'
import { notifyAdminsProductionInReview } from '@/lib/notifications/admin-events'

const updateSchema = z.object({
  taskName: z.string().min(1).optional(),
  currency: z.enum(['BRL', 'USD']).optional(),
  status: z
    .enum([
      'PARA_CRIACAO',
      'CRIANDO_GMAIL',
      'CRIANDO_GOOGLE_ADS',
      'VINCULANDO_CNPJ',
      'CONFIGURANDO_PERFIL_PAGAMENTO',
      'EM_REVISAO',
      'APROVADA',
      'REPROVADA',
      'ENVIADA_ESTOQUE',
      'ARQUIVADA',
    ])
    .optional(),
  estimatedDeliveryHours: z.number().int().positive().optional(),
  clientId: z.string().nullable().optional(),
  deliveryType: z.string().nullable().optional(),
  deliveryGroupId: z.string().nullable().optional(),
  cnpjLink: z.string().nullable().optional(),
  siteUrl: z.string().url().nullable().optional().or(z.literal('')),
  googleAdsCustomerId: z.string().nullable().optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response

  const { id } = await params
  const item = await prisma.productionG2.findFirst({
    where: { id, deletedAt: null },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      client: { include: { user: { select: { name: true } } } },
      deliveryGroup: { select: { id: true, groupNumber: true } },
      credentials: true,
    },
  })

  if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  if (auth.session.user?.role === 'PRODUCER' && item.creatorId !== auth.session.user.id) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const masked = { ...item }
  if (masked.credentials) {
    masked.credentials = {
      ...masked.credentials,
      passwordEncrypted: maskCredential(masked.credentials.passwordEncrypted),
      twoFaSecret: maskCredential(masked.credentials.twoFaSecret),
      twoFaSms: maskCredential(masked.credentials.twoFaSms),
      emailGoogle: masked.credentials.emailGoogle
        ? maskCredential(masked.credentials.emailGoogle, 6)
        : null,
      recoveryEmail: masked.credentials.recoveryEmail
        ? maskCredential(masked.credentials.recoveryEmail, 6)
        : null,
    } as typeof item.credentials
  }

  return NextResponse.json(masked)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response
  const session = auth.session

  const { id } = await params
  const existing = await prisma.productionG2.findFirst({ where: { id, deletedAt: null } })
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  if (session.user?.role === 'PRODUCER' && existing.creatorId !== session.user.id) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    if (data.cnpjLink !== undefined) {
      const cnpjNumber = data.cnpjLink ? extractCnpjFromLink(data.cnpjLink) : null
      if (cnpjNumber && (await isCnpjInUse(cnpjNumber, id))) {
        return NextResponse.json(
          { error: 'CNPJ já vinculado a outra conta ativa' },
          { status: 400 }
        )
      }
      ;(data as Record<string, unknown>).cnpjNumber = cnpjNumber
    }

    if (data.googleAdsCustomerId !== undefined && data.googleAdsCustomerId && (await isGoogleAdsIdInUse(data.googleAdsCustomerId, id))) {
      return NextResponse.json(
        { error: 'ID da Conta Google Ads já existe' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = { ...data }
    if (updateData.siteUrl === '') updateData.siteUrl = null
    if (updateData.clientId === null) updateData.clientId = null
    if (updateData.deliveryGroupId === null) updateData.deliveryGroupId = null
    if (updateData.cnpjLink === null) {
      updateData.cnpjLink = null
      updateData.cnpjNumber = null
    }
    if (data.status) {
      const validation = validateTransition(
        PRODUCTION_G2_TRANSITIONS,
        existing.status,
        data.status as keyof typeof PRODUCTION_G2_TRANSITIONS
      )
      if (!validation.ok) {
        return NextResponse.json({ error: validation.reason }, { status: 400 })
      }
    }
    if (data.status === 'REPROVADA' && !existing.rejectedReason && !body.rejectedReason) {
      return NextResponse.json(
        { error: 'Motivo obrigatório para reprovação' },
        { status: 400 }
      )
    }

    const prevStatus = existing.status
    if (data.status === 'REPROVADA') {
      updateData.rejectedAt = new Date()
      updateData.rejectedReason = body.rejectedReason || 'Não informado'
    }
    if (data.status === 'APROVADA') {
      updateData.approvedAt = new Date()
      updateData.rejectedAt = null
      updateData.rejectedReason = null
    }
    if (data.status === 'ARQUIVADA') {
      updateData.archivedAt = new Date()
    }

    const updated = await prisma.productionG2.update({
      where: { id },
      data: updateData,
      include: {
        creator: { select: { id: true, name: true, email: true } },
        client: { include: { user: { select: { name: true } } } },
        deliveryGroup: { select: { id: true, groupNumber: true } },
        credentials: true,
      },
    })

    await prisma.productionG2Log.create({
      data: {
        productionG2Id: id,
        userId: session.user!.id,
        action: 'UPDATE',
        details: {
          prevStatus,
          newStatus: data.status,
          fields: Object.keys(data),
        },
      },
    })

    await audit({
      userId: session.user!.id,
      action: 'production_g2_updated',
      entity: 'ProductionG2',
      entityId: id,
      details: { codeG2: updated.codeG2, status: data.status },
    })

    if (prevStatus !== 'EM_REVISAO' && data.status === 'EM_REVISAO') {
      notifyAdminsProductionInReview(updated.codeG2, updated.creator?.name ?? null).catch(console.error)
    }

    const masked = { ...updated }
    if (masked.credentials) {
      masked.credentials = {
        ...masked.credentials,
        passwordEncrypted: maskCredential(masked.credentials.passwordEncrypted),
        twoFaSecret: maskCredential(masked.credentials.twoFaSecret),
        twoFaSms: maskCredential(masked.credentials.twoFaSms),
      } as typeof updated.credentials
    }

    return NextResponse.json(masked)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}
