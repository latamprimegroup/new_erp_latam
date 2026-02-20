import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/estoque/itens
 * Lista itens do estoque para reserva
 * Query: ?tipo=email|cnpj|perfil &status=AVAILABLE|RESERVED &countryId= &nicheId= &cnae= &producerId=
 * Se producerId informado e status=RESERVED, retorna apenas itens reservados para esse produtor
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'FINANCE', 'PRODUCER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get('tipo') || 'cnpj'
  const status = (searchParams.get('status') || 'AVAILABLE') as 'AVAILABLE' | 'RESERVED'
  const countryId = searchParams.get('countryId')
  const nicheId = searchParams.get('nicheId')
  const cnae = searchParams.get('cnae')
  const producerId = searchParams.get('producerId') || session.user?.id

  const baseWhere: Record<string, unknown> = { status }
  if (countryId) baseWhere.countryId = countryId
  if (nicheId) baseWhere.nicheId = nicheId
  if (cnae) baseWhere.cnae = { contains: cnae }
  if (status === 'RESERVED' && producerId) baseWhere.assignedToProducerId = producerId

  if (tipo === 'email') {
    const emails = await prisma.email.findMany({
      where: baseWhere,
      include: { country: { select: { code: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json(
      emails.map((e) => ({
        id: e.id,
        email: e.email,
        recovery: e.recovery,
        status: e.status,
        country: e.country,
        assignedAt: e.assignedAt,
      }))
    )
  }

  if (tipo === 'cnpj') {
    const cnpjs = await prisma.cnpj.findMany({
      where: baseWhere,
      include: {
        country: { select: { code: true, name: true } },
        niche: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json(
      cnpjs.map((c) => ({
        id: c.id,
        cnpj: c.cnpj,
        razaoSocial: c.razaoSocial,
        nomeFantasia: c.nomeFantasia,
        cnae: c.cnae,
        cnaeDescricao: c.cnaeDescricao,
        status: c.status,
        country: c.country,
        niche: c.niche,
        assignedAt: c.assignedAt,
      }))
    )
  }

  if (tipo === 'perfil') {
    const perfis = await prisma.paymentProfile.findMany({
      where: baseWhere,
      include: {
        country: { select: { code: true, name: true } },
        cnpj: { select: { cnpj: true, razaoSocial: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json(
      perfis.map((p) => ({
        id: p.id,
        type: p.type,
        gateway: p.gateway,
        status: p.status,
        country: p.country,
        cnpj: p.cnpj,
        assignedAt: p.assignedAt,
      }))
    )
  }

  return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
}
