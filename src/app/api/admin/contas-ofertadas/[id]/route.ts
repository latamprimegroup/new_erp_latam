import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { notifyUser } from '@/lib/notifications'
import { decrypt } from '@/lib/encryption'
import { technicalBadgesForOffer, whatsappHref } from '@/lib/manager-offer'

export const dynamic = 'force-dynamic'

const reviewMetaSchema = z.object({
  docMatchesName: z.boolean().optional(),
  warmupOver7d: z.boolean().optional(),
  cookiesImportedOk: z.boolean().optional(),
})

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({
    action: z.literal('reject'),
    rejectionReason: z.string().min(1, 'Informe o motivo'),
    improvementNote: z.string().optional(),
    rejectionCode: z.string().optional(),
  }),
  z.object({
    action: z.literal('update_pricing'),
    markupPercent: z.number().min(0).max(1000).optional(),
    /** Margem fixa em R$ (soma ao custo); se enviado, recalcula preço final e ignora markup se ambos vierem. */
    marginFixed: z.number().min(0).optional(),
  }),
  z.object({
    action: z.literal('save_review'),
    offerReviewMeta: reviewMetaSchema,
  }),
])

function cookieJsonString(proxyConfig: unknown, notes: string | null | undefined): string {
  if (proxyConfig != null) {
    try {
      return typeof proxyConfig === 'string'
        ? proxyConfig
        : JSON.stringify(proxyConfig, null, 2)
    } catch {
      return String(proxyConfig)
    }
  }
  return notes?.trim() || ''
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const account = await prisma.stockAccount.findFirst({
    where: { id, managerId: { not: null }, deletedAt: null },
    include: {
      manager: { include: { user: { select: { name: true, email: true, id: true } } } },
      supplier: true,
      credential: { where: { deletedAt: null } },
    },
  })

  if (!account) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const cred = account.credential
  const passwordPlain = cred?.passwordEncrypted ? decrypt(cred.passwordEncrypted) : null
  const twoFaPlain = cred?.twoFaSecret ? decrypt(cred.twoFaSecret) : null

  const [delivered, failed] = account.managerId
    ? await Promise.all([
        prisma.stockAccount.count({
          where: { managerId: account.managerId, status: 'AVAILABLE', deletedAt: null },
        }),
        prisma.stockAccount.count({
          where: { managerId: account.managerId, status: 'REJECTED', deletedAt: null },
        }),
      ])
    : [0, 0]

  return NextResponse.json({
    id: account.id,
    platform: account.platform,
    type: account.type,
    niche: account.niche,
    status: account.status,
    purchasePrice: Number(account.purchasePrice ?? 0),
    salePrice: Number(account.salePrice ?? 0),
    markupPercent: account.markupPercent != null ? Number(account.markupPercent) : null,
    description: account.description,
    offerReviewMeta: account.offerReviewMeta,
    createdAt: account.createdAt.toISOString(),
    manager: account.manager
      ? {
          name: account.manager.user.name,
          email: account.manager.user.email,
          stats: { delivered, failed },
        }
      : null,
    supplier: account.supplier
      ? {
          name: account.supplier.name,
          contact: account.supplier.contact,
          whatsappUrl: whatsappHref(account.supplier.contact),
        }
      : null,
    technicalBadges: technicalBadgesForOffer({ status: account.status, credential: cred }),
    access: cred
      ? {
          email: cred.email,
          password: passwordPlain,
          twoFaSecret: twoFaPlain,
          recoveryEmail: cred.recoveryEmail,
          cookieJson: cookieJsonString(cred.proxyConfig, cred.notes),
        }
      : null,
    attachments: [] as { url: string; label: string }[],
    attachmentNote:
      'Documentos/prints vinculados a esta oferta ainda não têm armazenamento dedicado no ERP; use descrição e credenciais até o fluxo de upload do gestor.',
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  try {
    const body = patchSchema.parse(await req.json())

    const account = await prisma.stockAccount.findUnique({
      where: { id },
      include: { manager: { include: { user: { select: { id: true } } } } },
    })
    if (!account) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
    if (account.managerId == null) {
      return NextResponse.json({ error: 'Não é oferta de gestor' }, { status: 400 })
    }

    if (body.action === 'save_review') {
      await prisma.stockAccount.update({
        where: { id },
        data: {
          offerReviewMeta: body.offerReviewMeta as Prisma.InputJsonValue,
        },
      })
      await audit({
        userId: session.user.id,
        action: 'manager_offer_review_saved',
        entity: 'StockAccount',
        entityId: id,
        details: body.offerReviewMeta,
      })
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'update_pricing') {
      if (account.status !== 'PENDING') {
        return NextResponse.json({ error: 'Só é possível ajustar preço em ofertas pendentes' }, { status: 400 })
      }
      const purchase = Number(account.purchasePrice ?? 0)
      let salePrice = Number(account.salePrice ?? 0)
      let markupPercent = account.markupPercent != null ? Number(account.markupPercent) : null

      if (body.marginFixed != null) {
        salePrice = Math.round((purchase + body.marginFixed) * 100) / 100
        markupPercent = purchase > 0 ? Math.round(((salePrice - purchase) / purchase) * 10000) / 100 : null
      } else if (body.markupPercent != null) {
        markupPercent = body.markupPercent
        salePrice = Math.round(purchase * (1 + body.markupPercent / 100) * 100) / 100
      }

      await prisma.stockAccount.update({
        where: { id },
        data: {
          markupPercent: markupPercent != null ? new Prisma.Decimal(markupPercent) : null,
          salePrice: new Prisma.Decimal(salePrice),
        },
      })
      await audit({
        userId: session.user.id,
        action: 'manager_offer_pricing_updated',
        entity: 'StockAccount',
        entityId: id,
        details: { purchase, salePrice, markupPercent },
      })
      return NextResponse.json({ ok: true, salePrice, markupPercent })
    }

    if (account.status !== 'PENDING') {
      return NextResponse.json({ error: 'Conta já foi analisada' }, { status: 400 })
    }

    if (body.action === 'reject') {
      const fullReason = [body.rejectionReason, body.improvementNote?.trim()]
        .filter(Boolean)
        .join(' — ')

      await prisma.stockAccount.update({
        where: { id },
        data: { status: 'REJECTED' },
      })
      await audit({
        userId: session.user.id,
        action: 'stock_account_rejected',
        entity: 'StockAccount',
        entityId: id,
        details: {
          reason: fullReason,
          code: body.rejectionCode,
          improvementNote: body.improvementNote,
        },
      })
      if (account.manager?.userId) {
        await notifyUser(
          account.manager.userId,
          'Conta rejeitada',
          `A conta #${id.slice(0, 8)} foi rejeitada.${fullReason ? ` Motivo: ${fullReason}` : ''}`
        )
      }
      return NextResponse.json({ ok: true, status: 'REJECTED' })
    }

    await prisma.stockAccount.update({
      where: { id },
      data: { status: 'AVAILABLE' },
    })
    await audit({
      userId: session.user.id,
      action: 'stock_account_approved',
      entity: 'StockAccount',
      entityId: id,
    })
    if (account.manager?.userId) {
      await notifyUser(
        account.manager.userId,
        'Conta aprovada',
        `A conta #${id.slice(0, 8)} foi aprovada e está disponível no estoque.`
      )
    }
    return NextResponse.json({ ok: true, status: 'AVAILABLE' })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Erro ao processar' }, { status: 500 })
  }
}
