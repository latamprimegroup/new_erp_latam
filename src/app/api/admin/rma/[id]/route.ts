import { NextRequest, NextResponse } from 'next/server'
import { AccountRmaStatus } from '@prisma/client'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { minutesBetween, parseEvidenceUrls } from '@/lib/rma'

const ROLES = ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER', 'DELIVERER', 'COMMERCIAL'] as const

const patchSchema = z
  .object({
    status: z.nativeEnum(AccountRmaStatus).optional(),
    assignedToId: z.string().nullable().optional(),
    replacementAccountId: z.string().nullable().optional(),
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
          googleAdsCustomerId: true,
          status: true,
          deliveredAt: true,
        },
      },
      replacementAccount: {
        select: { id: true, googleAdsCustomerId: true, status: true },
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
  const existing = await prisma.accountReplacementRequest.findUnique({ where: { id } })
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
    assignedToId?: string | null
    replacementAccountId?: string | null
    resolvedAt?: Date | null
    resolutionMinutes?: number | null
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
      const acc = await prisma.stockAccount.findFirst({
        where: {
          id: body.replacementAccountId,
          clientId: existing.clientId,
          deletedAt: null,
        },
      })
      if (!acc) {
        return NextResponse.json(
          { error: 'Conta substituta deve pertencer ao mesmo cliente.' },
          { status: 400 }
        )
      }
    }
    data.replacementAccountId = body.replacementAccountId
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
        select: { id: true, platform: true, googleAdsCustomerId: true, status: true },
      },
      replacementAccount: {
        select: { id: true, googleAdsCustomerId: true, status: true },
      },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  })

  return NextResponse.json({
    ...updated,
    evidenceUrls: parseEvidenceUrls(updated.evidenceUrls),
  })
}
