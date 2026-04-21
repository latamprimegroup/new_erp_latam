import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { hashProductionAccountPassword, toProductionAccountPublic } from '@/lib/production-account-public'
import { notifyFinanceAndAdminsProductionClassicInReview } from '@/lib/notifications/admin-events'
import { normalizeDomain } from '@/lib/domain-normalize'

const EDITABLE_STATUSES = ['PENDING', 'UNDER_REVIEW'] as const

const PRODUCTION_NICHES = ['NUTRA', 'IGAMING', 'LOCAL', 'ECOM', 'OTHER'] as const
const VERIFICATION_GOALS = ['G2_AND_ADVERTISER', 'ADVERTISER_AND_COMMERCIAL_OPS'] as const

const updateSchema = z.object({
  platform: z.enum(['GOOGLE_ADS', 'META_ADS', 'KWAI_ADS', 'TIKTOK_ADS', 'OTHER']).optional(),
  type: z.string().min(1).optional(),
  accountCode: z.string().min(2).max(120).optional(),
  googleAdsCustomerId: z.string().optional().nullable(),
  currency: z.string().max(5).optional(),
  a2fCode: z.string().optional().nullable(),
  g2ApprovalCode: z.string().optional().nullable(),
  siteUrl: z.string().optional().refine((v) => !v || !v.trim() || v.startsWith('http'), { message: 'URL inv├ílida' }),
  cnpjBizLink: z.string().optional().refine((v) => !v || !v.trim() || v.startsWith('http'), { message: 'URL inv├ílida' }),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  cnpj: z.string().optional(),
  countryId: z.string().optional().nullable(),
  password: z.string().optional(),
  sendToReview: z.boolean().optional(),
  productionNiche: z.enum(PRODUCTION_NICHES).optional(),
  verificationGoal: z.enum(VERIFICATION_GOALS).optional(),
  primaryDomain: z.string().optional().nullable(),
  proxyNote: z.string().max(500).optional().nullable(),
  proxyConfigured: z.boolean().optional(),
})

/** Edi├º├úo flex├¡vel ap├│s aprova├º├úo (URLs/dom├¡nio/proxy + rota├º├úo de senha) */
const postApprovalSchema = z.object({
  siteUrl: z.string().optional().nullable().refine((v) => v == null || !String(v).trim() || String(v).startsWith('http'), {
    message: 'URL inv├ílida',
  }),
  cnpjBizLink: z.string().optional().nullable().refine((v) => v == null || !String(v).trim() || String(v).startsWith('http'), {
    message: 'URL inv├ílida',
  }),
  primaryDomain: z.string().optional().nullable(),
  proxyNote: z.string().max(500).optional().nullable(),
  proxyConfigured: z.boolean().optional(),
  password: z.string().max(500).optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'N├úo autorizado' }, { status: 401 })

  const { id } = await params
  const roles = ['ADMIN', 'PRODUCER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permiss├úo' }, { status: 403 })
  }

  const account = await prisma.productionAccount.findUnique({
    where: { id, deletedAt: null },
    include: { producer: true },
  })
  if (!account) return NextResponse.json({ error: 'Conta n├úo encontrada' }, { status: 404 })

  const isOwner = account.producerId === session.user.id
  if (!isOwner && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas o produtor ou admin pode editar' }, { status: 403 })
  }

  try {
    const body = await req.json()

    if (body?.sendToReview === true) {
      if (account.status !== 'PENDING') {
        return NextResponse.json({ error: 'S├│ ├® poss├¡vel enviar para an├ílise contas com status Pendente' }, { status: 400 })
      }
      if (process.env.PROXY_REQUIRED_FOR_REVIEW === '1' && !account.proxyConfigured) {
        return NextResponse.json(
          { error: 'Confirme o proxy (Proxy Cheap / AdsPower) antes de enviar para an├ílise.' },
          { status: 400 }
        )
      }
      const updated = await prisma.productionAccount.update({
        where: { id },
        data: { status: 'UNDER_REVIEW' },
        include: { producer: { select: { name: true } } },
      })
      await audit({
        userId: session.user.id,
        action: 'production_sent_to_review',
        entity: 'ProductionAccount',
        entityId: id,
      })
      const code = updated.accountCode || updated.googleAdsCustomerId || id.slice(0, 8)
      notifyFinanceAndAdminsProductionClassicInReview(code, updated.producer?.name ?? null).catch(
        console.error
      )
      return NextResponse.json(toProductionAccountPublic(updated))
    }

    if (account.status === 'APPROVED') {
      const data = postApprovalSchema.parse(body)
      const updateData: Record<string, unknown> = {}
      if (data.siteUrl !== undefined) updateData.siteUrl = data.siteUrl || null
      if (data.cnpjBizLink !== undefined) updateData.cnpjBizLink = data.cnpjBizLink || null
      if (data.proxyNote !== undefined) updateData.proxyNote = data.proxyNote || null
      if (data.proxyConfigured !== undefined) updateData.proxyConfigured = data.proxyConfigured
      if (data.primaryDomain !== undefined) {
        const norm = normalizeDomain(data.primaryDomain)
        if (norm) {
          const taken = await prisma.productionAccount.findFirst({
            where: { primaryDomain: norm, deletedAt: null, id: { not: id } },
          })
          if (taken) {
            return NextResponse.json({ error: 'Este dom├¡nio j├í est├í em uso em outra conta.' }, { status: 400 })
          }
        }
        updateData.primaryDomain = norm
      }
      if (data.password !== undefined && data.password.trim() !== '') {
        const plain = data.password.trim()
        if (plain.length < 4) {
          return NextResponse.json({ error: 'Senha muito curta (m├¡nimo 4 caracteres).' }, { status: 400 })
        }
        updateData.passwordHash = await hashProductionAccountPassword(plain)
      }
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
        action: 'production_updated_post_approval',
        entity: 'ProductionAccount',
        entityId: id,
        details: { fields: Object.keys(updateData).filter((k) => k !== 'passwordHash') },
      })
      return NextResponse.json(toProductionAccountPublic(updated))
    }

    if (!EDITABLE_STATUSES.includes(account.status as (typeof EDITABLE_STATUSES)[number])) {
      return NextResponse.json(
        { error: 'S├│ ├® poss├¡vel editar contas pendentes ou em an├ílise (antes da aprova├º├úo final)' },
        { status: 400 }
      )
    }

    const data = updateSchema.parse(body)

    const updateData: Record<string, unknown> = {}
    if (data.platform) updateData.platform = data.platform
    if (data.type) updateData.type = data.type
    if (data.email !== undefined) updateData.email = data.email || null
    if (data.cnpj !== undefined) updateData.cnpj = data.cnpj ? data.cnpj.replace(/\D/g, '') : null
    if (data.countryId !== undefined) updateData.countryId = data.countryId || null
    if (data.googleAdsCustomerId !== undefined) {
      const digits = (data.googleAdsCustomerId || '').replace(/\D/g, '')
      updateData.googleAdsCustomerId = digits.length >= 10
        ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`
        : data.googleAdsCustomerId || null
      if (digits.length >= 10) {
        const formatted = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`
        const [prodDup, stockDup] = await Promise.all([
          prisma.productionAccount.findFirst({
            where: {
              id: { not: id },
              deletedAt: null,
              status: { in: ['PENDING', 'UNDER_REVIEW', 'APPROVED'] },
              OR: [{ googleAdsCustomerId: formatted }, { googleAdsCustomerId: digits }],
            },
          }),
          prisma.stockAccount.findFirst({
            where: {
              deletedAt: null,
              OR: [{ googleAdsCustomerId: formatted }, { googleAdsCustomerId: digits }],
            },
          }),
        ])
        if (prodDup || stockDup) {
          return NextResponse.json(
            { error: 'ID da conta Google Ads j├í existe em outra conta da base. Bloqueado por footprint.' },
            { status: 400 }
          )
        }
      }
    }
    if (data.currency !== undefined) updateData.currency = data.currency
    if (data.a2fCode !== undefined) updateData.a2fCode = data.a2fCode || null
    if (data.a2fCode && data.a2fCode.trim()) {
      const dup2fa = await prisma.productionAccount.findFirst({
        where: {
          id: { not: id },
          deletedAt: null,
          status: { in: ['PENDING', 'UNDER_REVIEW', 'APPROVED'] },
          a2fCode: data.a2fCode.trim(),
        },
      })
      if (dup2fa) {
        return NextResponse.json({ error: '2FA j├í existe em outra conta da base.' }, { status: 400 })
      }
    }
    if (data.g2ApprovalCode !== undefined) updateData.g2ApprovalCode = data.g2ApprovalCode || null
    if (data.siteUrl !== undefined) updateData.siteUrl = data.siteUrl || null
    if (data.cnpjBizLink !== undefined) updateData.cnpjBizLink = data.cnpjBizLink || null
    if (data.productionNiche !== undefined) updateData.productionNiche = data.productionNiche
    if (data.verificationGoal !== undefined) updateData.verificationGoal = data.verificationGoal
    if (data.proxyNote !== undefined) updateData.proxyNote = data.proxyNote || null
    if (data.proxyConfigured !== undefined) updateData.proxyConfigured = data.proxyConfigured
    if (data.primaryDomain !== undefined) {
      const norm = normalizeDomain(data.primaryDomain)
      if (norm) {
        const taken = await prisma.productionAccount.findFirst({
          where: { primaryDomain: norm, deletedAt: null, id: { not: id } },
        })
        if (taken) {
          return NextResponse.json({ error: 'Este dom├¡nio j├í est├í em uso em outra conta.' }, { status: 400 })
        }
      }
      updateData.primaryDomain = norm
    }

    if (data.accountCode !== undefined) {
      const nextCode = data.accountCode.trim()
      const taken = await prisma.productionAccount.findFirst({
        where: {
          accountCode: nextCode,
          deletedAt: null,
          id: { not: id },
        },
      })
      if (taken) {
        return NextResponse.json({ error: 'Este identificador de conta j├í est├í em uso.' }, { status: 400 })
      }
      updateData.accountCode = nextCode
    }
    if (data.email !== undefined && data.email) {
      const dupEmail = await prisma.productionAccount.findFirst({
        where: {
          id: { not: id },
          deletedAt: null,
          status: { in: ['PENDING', 'UNDER_REVIEW', 'APPROVED'] },
          email: data.email,
        },
      })
      if (dupEmail) {
        return NextResponse.json({ error: 'E-mail j├í existe em outra conta da base.' }, { status: 400 })
      }
    }
    if (data.cnpj !== undefined && data.cnpj) {
      const clean = data.cnpj.replace(/\D/g, '')
      const dupCnpj = await prisma.productionAccount.findFirst({
        where: {
          id: { not: id },
          deletedAt: null,
          status: { in: ['PENDING', 'UNDER_REVIEW', 'APPROVED'] },
          cnpj: { contains: clean },
        },
      })
      if (dupCnpj) {
        return NextResponse.json({ error: 'CNPJ j├í existe em outra conta da base.' }, { status: 400 })
      }
    }

    if (data.password !== undefined && data.password.trim() !== '') {
      updateData.passwordHash = await hashProductionAccountPassword(data.password.trim())
    }

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
      details: { fields: Object.keys(updateData).filter((k) => k !== 'passwordHash') },
    })

    return NextResponse.json(toProductionAccountPublic(updated))
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
  if (!session) return NextResponse.json({ error: 'N├úo autorizado' }, { status: 401 })

  const { id } = await params
  const roles = ['ADMIN', 'PRODUCER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permiss├úo' }, { status: 403 })
  }

  const account = await prisma.productionAccount.findUnique({
    where: { id, deletedAt: null },
  })
  if (!account) return NextResponse.json({ error: 'Conta n├úo encontrada' }, { status: 404 })
  if (!EDITABLE_STATUSES.includes(account.status as (typeof EDITABLE_STATUSES)[number])) {
    return NextResponse.json(
      { error: 'S├│ ├® poss├¡vel excluir contas pendentes ou em an├ílise (antes da aprova├º├úo final)' },
      { status: 400 }
    )
  }

  const isOwner = account.producerId === session.user.id
  if (!isOwner && session.user.role !== 'ADMIN') {
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