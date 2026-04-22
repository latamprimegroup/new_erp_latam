import { NextRequest, NextResponse } from 'next/server'
import { AccountRmaActionTaken, AccountRmaStatus } from '@prisma/client'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { minutesBetween, parseEvidenceUrls } from '@/lib/rma'

const ROLES = ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER', 'DELIVERER', 'COMMERCIAL'] as const

const patchSchema = z
  .object({
    status:               z.nativeEnum(AccountRmaStatus).optional(),
    actionTaken:          z.nativeEnum(AccountRmaActionTaken).optional(),
    assignedToId:         z.string().nullable().optional(),
    replacementAccountId: z.string().nullable().optional(),
    warrantyHours:        z.number().int().min(1).max(8760).nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'Nada para atualizar' })

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const rma = await prisma.accountReplacementRequest.findUnique({
    where: { id },
    include: {
      client: { include: { user: { select: { name: true, email: true, phone: true } } } },
      originalAccount: {
        select: {
          id: true,
          platform: true,
          type: true,
          googleAdsCustomerId: true,
          status: true,
          deliveredAt: true,
          salePrice: true,
        },
      },
      replacementAccount: {
        select: { id: true, googleAdsCustomerId: true, platform: true, type: true, status: true },
      },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  })
  if (!rma) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  return NextResponse.json({
    ...rma,
    evidenceUrls: parseEvidenceUrls(rma.evidenceUrls),
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const existing = await prisma.accountReplacementRequest.findUnique({
    where: { id },
    include: {
      originalAccount: { select: { id: true, platform: true, type: true, googleAdsCustomerId: true, clientId: true } },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: {
    status?: AccountRmaStatus
    actionTaken?: AccountRmaActionTaken
    assignedToId?: string | null
    replacementAccountId?: string | null
    resolvedAt?: Date | null
    resolutionMinutes?: number | null
    warrantyHours?: number | null
    warrantyExpiresAt?: Date | null
    autoMessageSentAt?: Date | null
  } = {}

  if (body.assignedToId !== undefined) {
    if (body.assignedToId) {
      const u = await prisma.user.findUnique({ where: { id: body.assignedToId } })
      if (!u) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 400 })
    }
    data.assignedToId = body.assignedToId
  }

  if (body.replacementAccountId !== undefined) {
    if (body.replacementAccountId) {
      // A conta substituta deve vir do estoque DISPONÍVEL (AVAILABLE)
      const acc = await prisma.stockAccount.findFirst({
        where: {
          id: body.replacementAccountId,
          status: 'AVAILABLE',
          deletedAt: null,
          archivedAt: null,
        },
      })
      if (!acc) {
        return NextResponse.json(
          { error: 'Conta substituta não encontrada ou não está disponível no estoque.' },
          { status: 400 }
        )
      }
    }
    data.replacementAccountId = body.replacementAccountId
  }

  if (body.actionTaken !== undefined) {
    data.actionTaken = body.actionTaken
  }

  if (body.warrantyHours !== undefined) {
    data.warrantyHours = body.warrantyHours
    data.warrantyExpiresAt = body.warrantyHours
      ? new Date(existing.openedAt.getTime() + body.warrantyHours * 60 * 60 * 1000)
      : null
  }

  if (body.status !== undefined) {
    data.status = body.status
    const terminal = body.status === 'CONCLUIDO' || body.status === 'NEGADO_TERMO'
    if (terminal) {
      const end = new Date()
      data.resolvedAt = end
      data.resolutionMinutes = minutesBetween(existing.openedAt, end)
    } else {
      data.resolvedAt = null
      data.resolutionMinutes = null
    }
  }

  const updated = await prisma.accountReplacementRequest.update({
    where: { id },
    data,
    include: {
      client: { include: { user: { select: { name: true, email: true } } } },
      originalAccount: {
        select: { id: true, platform: true, type: true, googleAdsCustomerId: true, status: true, salePrice: true },
      },
      replacementAccount: {
        select: { id: true, googleAdsCustomerId: true, platform: true, type: true, status: true },
      },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  })

  // ── DAR SAÍDA NO ESTOQUE ao concluir reposição ────────────────────────────
  // Quando: CONCLUIDO + REPOSICAO_EFETUADA + tem conta substituta
  const isReplacement =
    (body.status === 'CONCLUIDO' || updated.status === 'CONCLUIDO') &&
    (body.actionTaken === 'REPOSICAO_EFETUADA' || updated.actionTaken === 'REPOSICAO_EFETUADA') &&
    updated.replacementAccountId

  if (isReplacement && updated.replacementAccountId) {
    await Promise.all([
      // 1. Marca conta ORIGINAL como DEAD (baixa do estoque)
      prisma.stockAccount.update({
        where: { id: existing.originalAccountId },
        data: { status: 'DEAD' },
      }).catch(() => null),

      // 2. Vincula conta SUBSTITUTA ao cliente e marca como DELIVERED
      prisma.stockAccount.update({
        where: { id: updated.replacementAccountId },
        data: {
          status: 'DELIVERED',
          clientId: existing.clientId,
          deliveredAt: new Date(),
        },
      }).catch(() => null),
    ])
  }

  // ── Mensagem automática ao concluir ──────────────────────────────────────
  if (
    body.status === 'CONCLUIDO' &&
    (body.actionTaken === 'REPOSICAO_EFETUADA' || updated.actionTaken === 'REPOSICAO_EFETUADA') &&
    !updated.autoMessageSentAt
  ) {
    const oldId = updated.originalAccount.googleAdsCustomerId || updated.originalAccountId.slice(0, 8)
    const newId = updated.replacementAccount?.googleAdsCustomerId || '—'
    const warrantyMsg = updated.warrantyHours ? ` Garantia renovada por mais ${updated.warrantyHours}h.` : ''
    const autoBody =
      `✅ Reposição da conta ${oldId} concluída. Novo ID: ${newId}.${warrantyMsg}`

    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })
    if (adminUser) {
      await prisma.rmaMessage.create({
        data: {
          rmaId: id,
          userId: updated.assignedToId || adminUser.id,
          body: autoBody,
          internalOnly: false,
        },
      }).catch(() => null)
    }

    await prisma.accountReplacementRequest.update({
      where: { id },
      data: { autoMessageSentAt: new Date() },
    }).catch(() => null)
  }

  return NextResponse.json({
    ...updated,
    evidenceUrls: parseEvidenceUrls(updated.evidenceUrls),
  })
}
