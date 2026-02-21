/**
 * API Briefing - CRUD + Geração
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sanitizeBriefing } from '@/lib/landing-factory/sanitize'
import { generateLandingHtml } from '@/lib/landing-factory/generate-html'

async function getClientId(session: { user?: { id?: string } }): Promise<string | null> {
  if (!session?.user?.id) return null
  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  return client?.id ?? null
}

/** GET - Listar briefings do cliente */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const clientId = await getClientId(session)
  if (!clientId) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 403 })

  const briefings = await prisma.landingBriefing.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      nomeEmpresa: true,
      nomeFantasia: true,
      nicho: true,
      subnicho: true,
      cidade: true,
      estado: true,
      whatsapp: true,
      status: true,
      servicos: true,
      createdAt: true,
      _count: { select: { pages: true } },
    },
  })

  return NextResponse.json({ briefings })
}

/** POST - Criar briefing */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const clientId = await getClientId(session)
  if (!clientId) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 403 })

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const clean = sanitizeBriefing(body)
  if (!clean.nomeEmpresa || !clean.nicho || !clean.cidade || !clean.estado || !clean.servicos) {
    return NextResponse.json({
      error: 'Nome da empresa, nicho, cidade, estado e serviços são obrigatórios',
    }, { status: 400 })
  }

  const briefing = await prisma.landingBriefing.create({
    data: {
      clientId,
      nomeEmpresa: clean.nomeEmpresa,
      nomeFantasia: clean.nomeFantasia,
      nicho: clean.nicho,
      subnicho: clean.subnicho,
      cidade: clean.cidade,
      estado: clean.estado,
      cnpj: clean.cnpj,
      endereco: clean.endereco,
      telefone: clean.telefone,
      whatsapp: clean.whatsapp,
      email: clean.email,
      horarioAtendimento: clean.horarioAtendimento,
      servicos: clean.servicos,
      anosExperiencia: clean.anosExperiencia,
      diferenciais: clean.diferenciais,
      objetivo: clean.objetivo,
      objetivoOutro: clean.objetivoOutro,
      tipoCliente: clean.tipoCliente,
      problemasDemandas: clean.problemasDemandas,
      perfilCliente: clean.perfilCliente,
      restricoes: clean.restricoes,
      publicoAlvo: clean.publicoAlvo,
      dor: clean.dor,
      solucao: clean.solucao,
      ofertaUnica: clean.ofertaUnica,
      status: 'DRAFT',
    },
  })

  return NextResponse.json(briefing)
}
