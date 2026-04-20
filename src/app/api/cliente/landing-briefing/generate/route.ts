/**
 * POST - Gerar Landing Page a partir do briefing
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateLandingHtml } from '@/lib/landing-factory/generate-html'
import { suggestComplianceFooter } from '@/lib/landing-injections'

async function getClientContext(session: { user?: { id?: string } }) {
  if (!session?.user?.id) return null
  return prisma.clientProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      whatsapp: true,
      gtmId: true,
      globalTrackingScript: true,
      complianceFooterDefault: true,
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const clientCtx = await getClientContext(session)
  if (!clientCtx) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 403 })
  const clientId = clientCtx.id

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

  const templateMode: 'WHITE' | 'BLACK' = briefing.templateMode === 'BLACK' ? 'BLACK' : 'WHITE'

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
    templateMode,
    vturbEmbed: briefing.vturbEmbed,
    footerHtml: briefing.footerHtml,
  }

  const footerEffective =
    briefing.footerHtml?.trim() ||
    clientCtx.complianceFooterDefault?.trim() ||
    suggestComplianceFooter({
      nomeEmpresa: briefing.nomeEmpresa,
      cnpj: briefing.cnpj,
      cidade: briefing.cidade,
      estado: briefing.estado,
    })

  const trackingMerged = [clientCtx.globalTrackingScript].filter(Boolean).join('\n')

  const html = await generateLandingHtml(clean, {
    gtmId: clientCtx.gtmId,
    infra: {
      templateMode,
      vturbEmbed: briefing.vturbEmbed,
      footerHtml: footerEffective,
      trackingScript: trackingMerged || null,
    },
  })

  const page = await prisma.landingPage.create({
    data: {
      briefingId,
      clientId,
      html,
      whatsapp: briefing.whatsapp,
      status: 'GERADO',
      templateMode,
      vturbEmbed: briefing.vturbEmbed,
      footerHtml: footerEffective,
      pageTrackingScript: null,
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
