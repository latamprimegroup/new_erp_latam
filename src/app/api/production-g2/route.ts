import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  extractCnpjFromLink,
  generateCodeG2,
  generateItemId,
  isCnpjInUse,
  isEmailGoogleInUse,
  isGoogleAdsIdInUse,
} from '@/lib/production-g2'
import { validateUniqueAssetsForG2 } from '@/lib/g2-agent'
import { consumeForProductionG2 } from '@/lib/stock-assignment'
import { getPaginationParams, paginatedResponse } from '@/lib/pagination'
import { audit } from '@/lib/audit'

const createSchema = z.object({
  taskName: z.string().min(1),
  currency: z.enum(['BRL', 'USD']).optional(),
  estimatedDeliveryHours: z.number().int().positive().optional(),
  clientId: z.string().optional(),
  deliveryType: z.string().optional(),
  deliveryGroupId: z.string().optional(),
  emailId: z.string().optional(),
  cnpjId: z.string().optional(),
  paymentProfileId: z.string().optional(),
  cnpjLink: z.string().optional(),
  siteUrl: z.string().url().optional().or(z.literal('')),
  googleAdsCustomerId: z.string().optional(),
  credentials: z
    .object({
      emailGoogle: z.string().email().optional(),
      passwordEncrypted: z.string().optional(),
      recoveryEmail: z.string().email().optional(),
      twoFaSecret: z.string().optional(),
      twoFaSms: z.string().optional(),
      securityStatus: z.string().optional(),
    })
    .optional(),
})

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const { page, limit, skip } = getPaginationParams(searchParams)
  const status = searchParams.get('status')
  const creatorId = searchParams.get('creatorId')
  const clientId = searchParams.get('clientId')
  const currency = searchParams.get('currency')

  const where: Record<string, unknown> = { archivedAt: null, deletedAt: null }
  if (status) where.status = status
  if (creatorId) where.creatorId = creatorId
  if (clientId) where.clientId = clientId
  if (currency) where.currency = currency

  const [items, total] = await Promise.all([
    prisma.productionG2.findMany({
      where,
      include: {
        creator: { select: { id: true, name: true, email: true } },
        client: { include: { user: { select: { name: true } } } },
        deliveryGroup: { select: { id: true, groupNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.productionG2.count({ where }),
  ])

  const paginated = paginatedResponse(items, total, page, limit)
  return NextResponse.json({ ...paginated, items })
}

export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response
  const session = auth.session

  try {
    const body = await req.json()
    const data = createSchema.parse(body)
    let cnpjNumber = data.cnpjLink ? extractCnpjFromLink(data.cnpjLink) : null
    if (data.cnpjId && !cnpjNumber) {
      const cnpj = await prisma.cnpj.findUnique({ where: { id: data.cnpjId }, select: { cnpj: true } })
      if (cnpj) cnpjNumber = cnpj.cnpj.replace(/\D/g, '')
    }

    if (cnpjNumber && (await isCnpjInUse(cnpjNumber))) {
      return NextResponse.json(
        { error: 'CNPJ já vinculado a outra conta ativa' },
        { status: 400 }
      )
    }
    if (data.credentials?.emailGoogle && (await isEmailGoogleInUse(data.credentials.emailGoogle))) {
      return NextResponse.json(
        { error: 'Email Google já vinculado a outra conta ativa' },
        { status: 400 }
      )
    }
    if (data.googleAdsCustomerId && (await isGoogleAdsIdInUse(data.googleAdsCustomerId))) {
      return NextResponse.json(
        { error: 'ID da Conta Google Ads já existe' },
        { status: 400 }
      )
    }

    const uniqueCheck = await validateUniqueAssetsForG2('', {
      emailGoogle: data.credentials?.emailGoogle,
      recoveryEmail: data.credentials?.recoveryEmail,
      googleAdsCustomerId: data.googleAdsCustomerId,
      cnpjNumber: cnpjNumber ?? undefined,
      paymentProfileId: data.paymentProfileId,
    })
    if (!uniqueCheck.ok) {
      return NextResponse.json({ error: uniqueCheck.error }, { status: 400 })
    }

    const [codeG2, itemId] = await Promise.all([generateCodeG2(), Promise.resolve(generateItemId())])

    const g2 = await prisma.$transaction(async (tx) => {
      const created = await tx.productionG2.create({
        data: {
          taskName: data.taskName,
          currency: data.currency || 'BRL',
          creatorId: session.user!.id,
          cnpjLink: data.cnpjLink || null,
          cnpjNumber: cnpjNumber ? cnpjNumber.slice(0, 14) : null,
          siteUrl: data.siteUrl || null,
          googleAdsCustomerId: data.googleAdsCustomerId || null,
          estimatedDeliveryHours: data.estimatedDeliveryHours ?? null,
          clientId: data.clientId || null,
          deliveryType: data.deliveryType || null,
          deliveryGroupId: data.deliveryGroupId || null,
          codeG2,
          itemId,
        },
        include: {
          creator: { select: { name: true } },
          client: { include: { user: { select: { name: true } } } },
        },
      })

      if (data.emailId || data.cnpjId || data.paymentProfileId) {
        const consumeResult = await consumeForProductionG2(created.id, session.user!.id, {
          emailId: data.emailId,
          cnpjId: data.cnpjId,
          paymentProfileId: data.paymentProfileId,
        }, tx)
        if (!consumeResult.ok) {
          throw new Error(consumeResult.error)
        }
      }

      if (data.credentials && Object.keys(data.credentials).length > 0) {
        await tx.productionG2Credential.create({
          data: {
            productionG2Id: created.id,
            emailGoogle: data.credentials.emailGoogle || null,
            passwordEncrypted: data.credentials.passwordEncrypted || null,
            recoveryEmail: data.credentials.recoveryEmail || null,
            twoFaSecret: data.credentials.twoFaSecret || null,
            twoFaSms: data.credentials.twoFaSms || null,
            securityStatus: data.credentials.securityStatus || null,
          },
        })
      }

      await tx.productionG2Log.create({
        data: {
          productionG2Id: created.id,
          userId: session.user!.id,
          action: 'CREATE',
          details: { taskName: data.taskName },
        },
      })

      return created
    })

    await audit({
      userId: session.user!.id,
      action: 'production_g2_created',
      entity: 'ProductionG2',
      entityId: g2.id,
      details: { codeG2: g2.codeG2 },
    })

    const full = await prisma.productionG2.findUnique({
      where: { id: g2.id },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        client: { include: { user: { select: { name: true } } } },
        deliveryGroup: { select: { id: true, groupNumber: true } },
        credentials: true,
      },
    })

    return NextResponse.json(full)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao criar produção G2' }, { status: 500 })
  }
}
