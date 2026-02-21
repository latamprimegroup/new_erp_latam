/**
 * POST - Gerar estrutura Google Ads (campanhas, keywords, anúncios)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateGoogleAdsStructure } from '@/lib/landing-factory/google-ads-generator'

async function getClientId(session: { user?: { id?: string } }): Promise<string | null> {
  if (!session?.user?.id) return null
  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
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

  const forAds = {
    nomeEmpresa: briefing.nomeEmpresa,
    nomeFantasia: briefing.nomeFantasia,
    nicho: briefing.nicho,
    subnicho: briefing.subnicho,
    cidade: briefing.cidade,
    estado: briefing.estado,
    servicos: briefing.servicos,
    diferenciais: briefing.diferenciais,
    anosExperiencia: briefing.anosExperiencia,
    objetivo: briefing.objetivo,
    telefone: briefing.telefone,
    whatsapp: briefing.whatsapp,
  }

  const structure = await generateGoogleAdsStructure(forAds)

  return NextResponse.json({
    structure,
    briefingId,
  })
}
