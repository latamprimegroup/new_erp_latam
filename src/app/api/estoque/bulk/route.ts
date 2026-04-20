import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AccountPlatform, AccountStatus } from '@prisma/client'

const platforms = ['GOOGLE_ADS', 'META_ADS', 'KWAI_ADS', 'TIKTOK_ADS', 'OTHER'] as const

const bodySchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(200),
    status: z.nativeEnum(AccountStatus).optional(),
    platform: z.enum(platforms).optional(),
  })
  .refine((d) => d.status != null || d.platform != null, {
    message: 'Informe status ou plataforma',
  })

/**
 * Atualização em massa de contas de estoque (correções rápidas). Não altera contas entregues (DELIVERED).
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const json = await req.json()
    const { ids, status, platform } = bodySchema.parse(json)

    const existing = await prisma.stockAccount.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, status: true },
    })

    const blocked = existing.filter((e) => e.status === AccountStatus.DELIVERED).map((e) => e.id)
    const allowedIds = existing.filter((e) => e.status !== AccountStatus.DELIVERED).map((e) => e.id)

    if (allowedIds.length === 0) {
      return NextResponse.json(
        {
          error: 'Nenhuma conta elegível (contas entregues não podem ser alteradas em lote).',
          blockedIds: blocked,
        },
        { status: 400 }
      )
    }

    const data: { status?: AccountStatus; platform?: AccountPlatform } = {}
    if (status != null) data.status = status
    if (platform != null) data.platform = platform as AccountPlatform

    const result = await prisma.stockAccount.updateMany({
      where: { id: { in: allowedIds } },
      data,
    })

    return NextResponse.json({
      updated: result.count,
      skippedDelivered: blocked.length,
      blockedIds: blocked,
    })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Dados inválidos' }, { status: 400 })
    }
    throw e
  }
}
