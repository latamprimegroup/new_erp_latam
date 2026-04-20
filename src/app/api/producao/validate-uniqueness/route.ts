import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Payload = {
  accountId?: string
  email?: string
  cnpj?: string
  googleAdsCustomerId?: string
  a2fCode?: string
}

const ACTIVE_PROD_STATUSES = ['PENDING', 'UNDER_REVIEW', 'APPROVED'] as const

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER', 'FINANCE'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Payload
  const excludeId = body.accountId || ''
  const email = body.email?.trim()
  const cnpjDigits = body.cnpj?.replace(/\D/g, '')
  const googleDigits = body.googleAdsCustomerId?.replace(/\D/g, '')
  const googleFmt =
    googleDigits && googleDigits.length >= 10
      ? `${googleDigits.slice(0, 3)}-${googleDigits.slice(3, 6)}-${googleDigits.slice(6, 10)}`
      : null
  const a2f = body.a2fCode?.trim()

  const issues: string[] = []

  if (email) {
    const [prod, base] = await Promise.all([
      prisma.productionAccount.findFirst({
        where: {
          id: { not: excludeId || undefined },
          deletedAt: null,
          status: { in: [...ACTIVE_PROD_STATUSES] },
          email,
        },
      }),
      prisma.email.findUnique({ where: { email } }),
    ])
    if (prod || base) issues.push('E-mail já existe em outra conta da base.')
  }

  if (cnpjDigits) {
    const [prod, base] = await Promise.all([
      prisma.productionAccount.findFirst({
        where: {
          id: { not: excludeId || undefined },
          deletedAt: null,
          status: { in: [...ACTIVE_PROD_STATUSES] },
          cnpj: { contains: cnpjDigits },
        },
      }),
      prisma.cnpj.findFirst({ where: { cnpj: { contains: cnpjDigits } } }),
    ])
    if (prod || base) issues.push('CNPJ já existe em outra conta da base.')
  }

  if (googleFmt || googleDigits) {
    const prod = await prisma.productionAccount.findFirst({
      where: {
        id: { not: excludeId || undefined },
        deletedAt: null,
        status: { in: [...ACTIVE_PROD_STATUSES] },
        OR: [{ googleAdsCustomerId: googleFmt || undefined }, { googleAdsCustomerId: googleDigits || undefined }],
      },
    })
    const stock = await prisma.stockAccount.findFirst({
      where: {
        deletedAt: null,
        OR: [{ googleAdsCustomerId: googleFmt || undefined }, { googleAdsCustomerId: googleDigits || undefined }],
      },
    })
    if (prod || stock) issues.push('ID da conta Google Ads já existe em outra conta da base.')
  }

  if (a2f) {
    const prod = await prisma.productionAccount.findFirst({
      where: {
        id: { not: excludeId || undefined },
        deletedAt: null,
        status: { in: [...ACTIVE_PROD_STATUSES] },
        a2fCode: a2f,
      },
    })
    if (prod) issues.push('2FA já existe em outra conta da base.')
  }

  return NextResponse.json({ ok: issues.length === 0, issues })
}
