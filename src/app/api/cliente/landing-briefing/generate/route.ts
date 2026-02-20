/**
 * POST - Gerar Landing Page a partir do briefing
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateLandingHtml } from '@/lib/landing-factory/generate-html'

async function getClientId(session: { user?: { id?: string } }): Promise<string | null> {
  if (!session?.user?.id) return null
  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, whatsapp: true },
  })
  return client?.id ?? null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const clientId = await getClientId(session)
  if (!clientId) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 403 })

  let body: { briefingId?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const briefingId = body.briefingId
  if (!briefingId) {
    return NextResponse.json({ error: 'briefingId obrigatório' }, { status: 400 })
  }

  const briefing = await prisma.landingBriefing.findFirst({
    where: { id: briefingId, clientId },
  })

  if (!briefing) {
    return NextResponse.json({ error: 'Briefing não encontrado' }, { status: 404 })
  }

  const clean = {
    nomeEmpresa: briefing.nomeEmpresa,
    nomeFantasia: briefing.nomeFantasia,
    nicho: briefing.nicho,
    subnicho: briefing.subnicho,
    cidade: briefing.cidade,
    estado: briefing.estado,
    cnpj: briefing.cnpj,
    endereco: briefing.endereco,
    telefone: briefing.telefone,
    whatsapp: briefing.whatsapp,
    email: briefing.email,
    horarioAtendimento: briefing.horarioAtendimento,
    servicos: briefing.servicos,
    anosExperiencia: briefing.anosExperiencia,
    diferenciais: briefing.diferenciais,
    objetivo: briefing.objetivo,
    objetivoOutro: briefing.objetivoOutro,
    tipoCliente: briefing.tipoCliente,
    problemasDemandas: briefing.problemasDemandas,
    perfilCliente: briefing.perfilCliente,
    restricoes: briefing.restricoes,
    publicoAlvo: briefing.publicoAlvo,
    dor: briefing.dor,
    solucao: briefing.solucao,
    ofertaUnica: briefing.ofertaUnica,
  }

  const html = await generateLandingHtml(clean)

  const page = await prisma.landingPage.create({
    data: {
      briefingId,
      clientId,
      html,
      whatsapp: briefing.whatsapp,
      status: 'GERADO',
    },
  })

  await prisma.landingBriefing.update({
    where: { id: briefingId },
    data: { status: 'GERADO' },
  })

  return NextResponse.json({
    pageId: page.id,
    html: page.html,
    status: 'GERADO',
  })
}
