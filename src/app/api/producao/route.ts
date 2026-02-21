import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { notifyAdminsProductionAccountPending } from '@/lib/notifications/admin-events'
import { consumeEmail, consumeCnpj, consumePaymentProfile } from '@/lib/stock-assignment'
import { getAuthenticatedKey, withRateLimit } from '@/lib/rate-limit-api'

const createSchema = z.object({
  platform: z.enum(['GOOGLE_ADS', 'META_ADS', 'KWAI_ADS', 'TIKTOK_ADS', 'OTHER']),
  type: z.string().min(1),
  countryId: z.string().optional(),
  // Modo 1: IDs de itens reservados (usa estoque com atribuição exclusiva)
  emailId: z.string().optional(),
  cnpjId: z.string().optional(),
  paymentProfileId: z.string().optional(),
  // Modo 2: valores manuais (legado)
  email: z.union([z.string().email(), z.literal('')]).optional(),
  cnpj: z.string().optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const producerId = searchParams.get('producerId')
  const status = searchParams.get('status')

  const where: Record<string, unknown> = { deletedAt: null }
  if (producerId) where.producerId = producerId
  if (status) where.status = status

  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0))
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  const [accounts, dailyCount, monthlyCount, g2Daily, g2Monthly] = await Promise.all([
    prisma.productionAccount.findMany({
      where,
      include: { producer: { select: { name: true, email: true } } },
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
        ...(producerId ? { creatorId: producerId } : {}),
        approvedAt: { gte: startOfDay },
      },
    }),
    prisma.productionG2.count({
      where: {
        archivedAt: null,
        deletedAt: null,
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        ...(producerId ? { creatorId: producerId } : {}),
        approvedAt: { gte: startOfMonth },
      },
    }),
  ])

  return NextResponse.json({
    accounts,
    kpis: {
      daily: dailyCount + g2Daily,
      monthly: monthlyCount + g2Monthly,
      dailyProd: dailyCount,
      monthlyProd: monthlyCount,
      dailyG2: g2Daily,
      monthlyG2: g2Monthly,
    },
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const limited = withRateLimit(req, getAuthenticatedKey(session.user!.id, 'producao:create'), { max: 50, windowMs: 60_000 })
  if (limited) return limited

  const roles = ['ADMIN', 'PRODUCER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = createSchema.parse(body)
    const producerId = session.user.id

    // Modo estoque: usar itens reservados (emailId, cnpjId, paymentProfileId)
    const useStock = data.emailId || data.cnpjId || data.paymentProfileId

    let emailVal: string | null = null
    let cnpjVal: string | null = null

    if (useStock) {
      // Validar que os itens estão reservados para este produtor
      if (data.emailId) {
        const email = await prisma.email.findUnique({ where: { id: data.emailId } })
        if (!email || email.status !== 'RESERVED' || email.assignedToProducerId !== producerId) {
          return NextResponse.json(
            { error: 'E-mail não está reservado para você. Reserve-o em Estoque > Itens.' },
            { status: 400 }
          )
        }
        emailVal = email.email
      }
      if (data.cnpjId) {
        const cnpj = await prisma.cnpj.findUnique({ where: { id: data.cnpjId } })
        if (!cnpj || cnpj.status !== 'RESERVED' || cnpj.assignedToProducerId !== producerId) {
          return NextResponse.json(
            { error: 'CNPJ não está reservado para você. Reserve-o em Estoque > Itens.' },
            { status: 400 }
          )
        }
        cnpjVal = cnpj.cnpj
      }
      if (data.paymentProfileId) {
        const profile = await prisma.paymentProfile.findUnique({ where: { id: data.paymentProfileId } })
        if (!profile || profile.status !== 'RESERVED' || profile.assignedToProducerId !== producerId) {
          return NextResponse.json(
            { error: 'Perfil de pagamento não está reservado para você.' },
            { status: 400 }
          )
        }
      }
    } else {
      // Modo manual: validar duplicidade
      if (data.email) {
        const existingEmail = await prisma.email.findUnique({ where: { email: data.email } })
        if (existingEmail) {
          return NextResponse.json(
            { error: 'E-mail já cadastrado na base. Use outro e-mail ou reserve do estoque.' },
            { status: 400 }
          )
        }
        const prodWithEmail = await prisma.productionAccount.findFirst({
          where: { email: data.email, status: { in: ['PENDING', 'APPROVED'] } },
        })
        if (prodWithEmail) {
          return NextResponse.json({ error: 'E-mail já em uso em outra conta.' }, { status: 400 })
        }
        emailVal = data.email
      }
      if (data.cnpj) {
        const cleanCnpj = data.cnpj.replace(/\D/g, '')
        const existingCnpj = await prisma.cnpj.findFirst({
          where: { cnpj: { contains: cleanCnpj } },
        })
        if (existingCnpj) {
          return NextResponse.json(
            { error: 'CNPJ já cadastrado. Use outro ou reserve do estoque.' },
            { status: 400 }
          )
        }
        const prodWithCnpj = await prisma.productionAccount.findFirst({
          where: { cnpj: { contains: cleanCnpj }, status: { in: ['PENDING', 'APPROVED'] } },
        })
        if (prodWithCnpj) {
          return NextResponse.json({ error: 'CNPJ já em uso em outra conta.' }, { status: 400 })
        }
        cnpjVal = cleanCnpj
      }
    }

    const account = await prisma.productionAccount.create({
      data: {
        platform: data.platform as 'GOOGLE_ADS' | 'META_ADS' | 'KWAI_ADS' | 'TIKTOK_ADS' | 'OTHER',
        type: data.type,
        email: emailVal,
        cnpj: cnpjVal,
        countryId: data.countryId || null,
        producerId,
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

    return NextResponse.json(account)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 })
  }
}
