import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { notifyAdminsProductionAccountPending } from '@/lib/notifications/admin-events'
import { consumeEmail, consumeCnpj, consumePaymentProfile } from '@/lib/stock-assignment'
import { getAuthenticatedKey, withRateLimit } from '@/lib/rate-limit-api'
import { hashProductionAccountPassword, toProductionAccountPublic } from '@/lib/production-account-public'
import { normalizeDomain } from '@/lib/domain-normalize'
import { getProductionConfig } from '@/lib/production-payment'
import { productionAccountCreateSchema } from '@/lib/schemas/production-account-create'

const ACTIVE_PROD_STATUSES = ['PENDING', 'UNDER_REVIEW', 'APPROVED'] as const

function duplicateGoogleAccountMsg(collaboratorName: string | null) {
  const nome = collaboratorName?.trim()
  return `Esta conta j├í foi produzida por ${nome || 'outro colaborador'}.`
}

async function findActiveProductionByGoogleCustomerId(formattedTenDigit: string, normalizedDigits: string) {
  return prisma.productionAccount.findFirst({
    where: {
      deletedAt: null,
      status: { in: [...ACTIVE_PROD_STATUSES] },
      OR: [
        { googleAdsCustomerId: formattedTenDigit },
        { googleAdsCustomerId: normalizedDigits },
      ],
    },
    include: { producer: { select: { name: true } } },
  })
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'N├úo autorizado' }, { status: 401 })

  const allowedRoles = ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER']
  if (!session.user?.role || !allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permiss├úo' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const producerIdParam = searchParams.get('producerId')
  const status = searchParams.get('status')
  const q = searchParams.get('q')?.trim() ?? ''

  /** Produtor: isolamento total ÔÇö s├│ v├¬ contas atribu├¡das a ele. Gerente/admin: vis├úo global ou filtro. */
  const scopedProducerId =
    session.user.role === 'PRODUCER'
      ? session.user.id
      : producerIdParam && ['ADMIN', 'PRODUCTION_MANAGER'].includes(session.user.role)
        ? producerIdParam
        : undefined

  let where: Record<string, unknown> = { deletedAt: null }
  if (scopedProducerId) where.producerId = scopedProducerId
  if (status) where.status = status

  if (q.length > 0) {
    const term = q
    const digits = term.replace(/\D/g, '')
    const or: Record<string, unknown>[] = [
      { accountCode: { contains: term } },
      { email: { contains: term } },
      { googleAdsCustomerId: { contains: term } },
      { type: { contains: term } },
    ]
    if (digits.length >= 4) or.push({ cnpj: { contains: digits } })
    if (term.length >= 7) or.push({ id: { startsWith: term } })
    where = { AND: [where, { OR: or }] }
  }

  const scopeForPipeline: Record<string, unknown> = { deletedAt: null }
  if (scopedProducerId) scopeForPipeline.producerId = scopedProducerId

  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0))
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  const [accounts, dailyCount, monthlyCount, g2Daily, g2Monthly, pendingReviewCount, metaProducaoGlobal, paymentCfg] =
    await Promise.all([
      prisma.productionAccount.findMany({
        where,
        include: {
          producer: { select: { name: true, email: true } },
          cnpjConsumed: { select: { razaoSocial: true, nomeFantasia: true, cnpj: true } },
          emailConsumed: { select: { email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.productionAccount.count({
        where: { ...where, status: 'APPROVED', updatedAt: { gte: startOfDay } },
      }),
      prisma.productionAccount.count({
        where: { ...where, status: 'APPROVED', updatedAt: { gte: startOfMonth } },
      }),
      prisma.productionG2.count({
        where: {
          archivedAt: null,
          deletedAt: null,
          status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
          ...(scopedProducerId ? { creatorId: scopedProducerId } : {}),
          approvedAt: { gte: startOfDay },
        },
      }),
      prisma.productionG2.count({
        where: {
          archivedAt: null,
          deletedAt: null,
          status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
          ...(scopedProducerId ? { creatorId: scopedProducerId } : {}),
          approvedAt: { gte: startOfMonth },
        },
      }),
      prisma.productionAccount.count({
        where: { ...scopeForPipeline, status: 'UNDER_REVIEW' },
      }),
      prisma.systemSetting.findUnique({ where: { key: 'meta_producao_mensal' } }),
      getProductionConfig(),
    ])

  const metaProducaoMensal =
    session.user.role === 'PRODUCER'
      ? paymentCfg.metaMensal
      : metaProducaoGlobal
        ? parseInt(metaProducaoGlobal.value, 10)
        : 10000

  return NextResponse.json({
    accounts: accounts.map((a) => toProductionAccountPublic(a)),
    metaProducaoMensal,
    kpis: {
      daily: dailyCount + g2Daily,
      monthly: monthlyCount + g2Monthly,
      dailyProd: dailyCount,
      monthlyProd: monthlyCount,
      dailyG2: g2Daily,
      monthlyG2: g2Monthly,
      pendingReview: pendingReviewCount,
    },
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'N├úo autorizado' }, { status: 401 })

  const limited = withRateLimit(req, getAuthenticatedKey(session.user!.id, 'producao:create'), { max: 50, windowMs: 60_000 })
  if (limited) return limited

  const roles = ['ADMIN', 'PRODUCER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permiss├úo' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = productionAccountCreateSchema.parse(body)
    const producerId = session.user.id
    const accountCode = data.accountCode.trim()

    const codeTaken = await prisma.productionAccount.findFirst({
      where: { accountCode, deletedAt: null },
    })
    if (codeTaken) {
      return NextResponse.json(
        { error: 'Este identificador de conta j├í est├í em uso. Escolha outro.' },
        { status: 400 }
      )
    }

    const emailInput = data.email?.trim()
    const hasManualEmail = !!emailInput && emailInput.length > 0
    const a2fInput = data.a2fCode?.trim()

    if (data.paymentProfileId) {
      const linkedProfile = await prisma.productionAccount.findFirst({
        where: { paymentProfileId: data.paymentProfileId, deletedAt: null },
      })
      if (linkedProfile) {
        return NextResponse.json(
          { error: 'Este perfil de pagamento j├í est├í vinculado a outra produ├º├úo ativa.' },
          { status: 400 }
        )
      }
      const profile = await prisma.paymentProfile.findUnique({
        where: { id: data.paymentProfileId },
        select: { id: true, type: true, gateway: true, cnpjId: true },
      })
      if (profile?.cnpjId) {
        const isContaSimples =
          profile.type.toLowerCase().includes('conta simples') ||
          profile.gateway.toLowerCase().includes('conta simples')
        if (isContaSimples) {
          const usageCount = await prisma.productionAccount.count({
            where: {
              deletedAt: null,
              paymentProfileConsumed: { cnpjId: profile.cnpjId },
            },
          })
          if (usageCount >= 5) {
            return NextResponse.json(
              { error: 'Cart├úo Conta Simples atingiu o limite de 5 usos. 6┬¬ tentativa bloqueada.' },
              { status: 400 }
            )
          }
        }
      }
    }

    const normDomain = normalizeDomain(data.primaryDomain)
    if (normDomain) {
      const domainTaken = await prisma.productionAccount.findFirst({
        where: { primaryDomain: normDomain, deletedAt: null },
      })
      if (domainTaken) {
        return NextResponse.json(
          { error: 'Este dom├¡nio j├í est├í cadastrado em outra conta (footprint).' },
          { status: 400 }
        )
      }
    }

    // Modo estoque: usar itens reservados (emailId, cnpjId, paymentProfileId)
    const useStock = data.emailId || data.cnpjId || data.paymentProfileId

    let emailVal: string | null = null
    let cnpjVal: string | null = null

    if (useStock) {
      // Validar que os itens est├úo reservados para este produtor
      if (data.emailId) {
        const email = await prisma.email.findUnique({ where: { id: data.emailId } })
        if (!email || email.status !== 'RESERVED' || email.assignedToProducerId !== producerId) {
          return NextResponse.json(
            { error: 'E-mail n├úo est├í reservado para voc├¬. Reserve-o em Estoque > Itens.' },
            { status: 400 }
          )
        }
        emailVal = email.email
      }
      if (data.cnpjId) {
        const cnpj = await prisma.cnpj.findUnique({ where: { id: data.cnpjId } })
        if (!cnpj || cnpj.status !== 'RESERVED' || cnpj.assignedToProducerId !== producerId) {
          return NextResponse.json(
            { error: 'CNPJ n├úo est├í reservado para voc├¬. Reserve-o em Estoque > Itens.' },
            { status: 400 }
          )
        }
        cnpjVal = cnpj.cnpj
      }
      if (data.paymentProfileId) {
        const profile = await prisma.paymentProfile.findUnique({ where: { id: data.paymentProfileId } })
        if (!profile || profile.status !== 'RESERVED' || profile.assignedToProducerId !== producerId) {
          return NextResponse.json(
            { error: 'Perfil de pagamento n├úo est├í reservado para voc├¬.' },
            { status: 400 }
          )
        }
      }
    } else {
      // Modo manual: duplicidade e-mail / CNPJ
      if (hasManualEmail && emailInput) {
        const existingEmail = await prisma.email.findUnique({ where: { email: emailInput } })
        if (existingEmail) {
          return NextResponse.json(
            { error: 'E-mail j├í cadastrado na base. Use outro e-mail ou reserve do estoque.' },
            { status: 400 }
          )
        }
        const prodWithEmail = await prisma.productionAccount.findFirst({
          where: { email: emailInput, status: { in: [...ACTIVE_PROD_STATUSES] }, deletedAt: null },
          include: { producer: { select: { name: true } } },
        })
        if (prodWithEmail) {
          return NextResponse.json(
            {
              error: `Esta conta j├í foi produzida por ${prodWithEmail.producer?.name?.trim() || 'outro colaborador'}.`,
            },
            { status: 400 }
          )
        }
        emailVal = emailInput
      }
      if (data.cnpj) {
        const cleanCnpj = data.cnpj.replace(/\D/g, '')
        const existingCnpj = await prisma.cnpj.findFirst({
          where: { cnpj: { contains: cleanCnpj } },
        })
        if (existingCnpj) {
          return NextResponse.json(
            { error: 'CNPJ j├í cadastrado. Use outro ou reserve do estoque.' },
            { status: 400 }
          )
        }
        const prodWithCnpj = await prisma.productionAccount.findFirst({
          where: { cnpj: { contains: cleanCnpj }, status: { in: [...ACTIVE_PROD_STATUSES] }, deletedAt: null },
          include: { producer: { select: { name: true } } },
        })
        if (prodWithCnpj) {
          return NextResponse.json(
            {
              error: `Esta conta j├í foi produzida por ${prodWithCnpj.producer?.name?.trim() || 'outro colaborador'}.`,
            },
            { status: 400 }
          )
        }
        cnpjVal = cleanCnpj
      }
    }

    if (a2fInput) {
      const duplicate2fa = await prisma.productionAccount.findFirst({
        where: { a2fCode: a2fInput, status: { in: [...ACTIVE_PROD_STATUSES] }, deletedAt: null },
        include: { producer: { select: { name: true } } },
      })
      if (duplicate2fa) {
        return NextResponse.json(
          {
            error: `Esta conta j├í foi produzida por ${duplicate2fa.producer?.name?.trim() || 'outro colaborador'}.`,
          },
          { status: 400 }
        )
      }
    }

    // Google Customer ID: bloqueia duplicidade tamb├®m no modo estoque
    if (data.googleAdsCustomerId) {
      const normalized = data.googleAdsCustomerId.replace(/\D/g, '')
      if (normalized.length >= 10) {
        const formatted = `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6, 10)}`
        const prodWithId = await findActiveProductionByGoogleCustomerId(formatted, normalized)
        if (prodWithId) {
          return NextResponse.json(
            { error: duplicateGoogleAccountMsg(prodWithId.producer?.name ?? null) },
            { status: 400 }
          )
        }
      }
      const stockDup = await prisma.stockAccount.findFirst({
        where: { deletedAt: null, OR: [{ googleAdsCustomerId: normalized }, { googleAdsCustomerId: data.googleAdsCustomerId }] },
      })
      if (stockDup) {
        return NextResponse.json(
          { error: 'ID da conta Google Ads j├í existe no estoque/base. Bloqueado por footprint.' },
          { status: 400 }
        )
      }
    }

    const digits = data.googleAdsCustomerId?.replace(/\D/g, '') ?? ''
    const googleAdsId = digits.length >= 10
      ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`
      : data.googleAdsCustomerId || null

    let passwordHash: string | null = null
    if (data.password?.trim()) {
      passwordHash = await hashProductionAccountPassword(data.password.trim())
    }

    const account = await prisma.productionAccount.create({
      data: {
        accountCode,
        platform: data.platform as 'GOOGLE_ADS' | 'META_ADS' | 'KWAI_ADS' | 'TIKTOK_ADS' | 'OTHER',
        type: data.type,
        email: emailVal,
        cnpj: cnpjVal,
        countryId: data.countryId || null,
        producerId,
        passwordHash,
        googleAdsCustomerId: googleAdsId || null,
        currency: data.currency || 'BRL',
        a2fCode: data.a2fCode || null,
        g2ApprovalCode: data.g2ApprovalCode || null,
        siteUrl: data.siteUrl || null,
        cnpjBizLink: data.cnpjBizLink || null,
        productionNiche: data.productionNiche,
        verificationGoal: data.verificationGoal,
        primaryDomain: normDomain,
        proxyNote: data.proxyNote?.trim() || null,
        proxyConfigured: data.proxyConfigured ?? false,
      },
      include: { producer: { select: { name: true } } },
    })

    // Consumir itens reservados (marcar como CONSUMED e vincular)
    if (useStock) {
      if (data.emailId) {
        const r = await consumeEmail(data.emailId, account.id)
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
      }
      if (data.cnpjId) {
        const r = await consumeCnpj(data.cnpjId, account.id)
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
      }
      if (data.paymentProfileId) {
        const r = await consumePaymentProfile(data.paymentProfileId, account.id)
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
      }
    }

    await audit({
      userId: producerId,
      action: 'production_created',
      entity: 'ProductionAccount',
      entityId: account.id,
      details: useStock ? { fromStock: true } : undefined,
    })

    notifyAdminsProductionAccountPending(account.platform, account.producer?.name ?? null).catch(console.error)

    return NextResponse.json(toProductionAccountPublic(account))
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 })
  }
}