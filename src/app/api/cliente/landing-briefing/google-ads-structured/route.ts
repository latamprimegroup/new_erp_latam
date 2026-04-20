import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateGoogleAdsStructured } from '@/lib/landing-factory/google-ads-structured'

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
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const clientId = await getClientId(session)
  if (!clientId) return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { briefingId?: string }
  if (!body.briefingId) return NextResponse.json({ error: 'briefingId obrigatorio' }, { status: 400 })

  const briefing = await prisma.landingBriefing.findFirst({ where: { id: body.briefingId, clientId } })
  if (!briefing) return NextResponse.json({ error: 'Briefing nao encontrado' }, { status: 404 })

  const structured = generateGoogleAdsStructured({
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
  })

  return NextResponse.json(structured)
}
