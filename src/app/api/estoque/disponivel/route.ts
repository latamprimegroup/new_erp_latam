import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/estoque/disponivel
 * Retorna resumo do estoque disponível por país, nicho e CNAE
 * Para produtores: também mostra itens já atribuídos a eles
 * Query: ?countryId=... &nicheId=... &cnae=... &producerId=...
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'FINANCE', 'PRODUCER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const countryId = searchParams.get('countryId')
  const nicheId = searchParams.get('nicheId')
  const cnae = searchParams.get('cnae')
  const producerId = searchParams.get('producerId') || session.user?.id

  const whereEmail: Record<string, unknown> = { status: 'AVAILABLE' }
  const whereCnpj: Record<string, unknown> = { status: 'AVAILABLE' }
  const whereProfile: Record<string, unknown> = { status: 'AVAILABLE' }

  if (countryId) {
    whereEmail.countryId = countryId
    whereCnpj.countryId = countryId
    whereProfile.countryId = countryId
  }
  if (nicheId) whereCnpj.nicheId = nicheId
  if (cnae) whereCnpj.cnae = { contains: cnae }

  const [emailsAvailable, cnpjsAvailable, profilesAvailable, emailsReserved, cnpjsReserved, profilesReserved] =
    await Promise.all([
      prisma.email.count({ where: whereEmail }),
      prisma.cnpj.count({ where: whereCnpj }),
      prisma.paymentProfile.count({ where: whereProfile }),
      producerId
        ? prisma.email.count({
            where: { ...whereEmail, status: 'RESERVED', assignedToProducerId: producerId },
          })
        : 0,
      producerId
        ? prisma.cnpj.count({
            where: { ...whereCnpj, status: 'RESERVED', assignedToProducerId: producerId },
          })
        : 0,
      producerId
        ? prisma.paymentProfile.count({
            where: { ...whereProfile, status: 'RESERVED', assignedToProducerId: producerId },
          })
        : 0,
    ])

  const countries = await prisma.country.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  })

  const niches = await prisma.niche.findMany({
    where: { active: true },
    include: { country: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({
    disponivel: {
      emails: emailsAvailable,
      cnpjs: cnpjsAvailable,
      perfisPagamento: profilesAvailable,
    },
    reservadoParaMim: {
      emails: emailsReserved,
      cnpjs: cnpjsReserved,
      perfisPagamento: profilesReserved,
    },
    countries,
    niches,
  })
}
