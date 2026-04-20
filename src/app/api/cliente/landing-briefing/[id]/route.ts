/**
 * PATCH — atualizar briefing (modo template, Vturb, rodapé) — ecossistema Lander Builder
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sanitizeBriefing } from '@/lib/landing-factory/sanitize'

async function getClientId(session: { user?: { id?: string } }): Promise<string | null> {
  if (!session?.user?.id) return null
  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  return client?.id ?? null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const clientId = await getClientId(session)
  if (!clientId) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 403 })

  const { id } = await params
  const existing = await prisma.landingBriefing.findFirst({
    where: { id, clientId },
  })
  if (!existing) return NextResponse.json({ error: 'Briefing não encontrado' }, { status: 404 })

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const clean = sanitizeBriefing({ ...existing, ...body })
  const updated = await prisma.landingBriefing.update({
    where: { id },
    data: {
      templateMode: clean.templateMode,
      vturbEmbed: clean.vturbEmbed,
      footerHtml: clean.footerHtml,
    },
  })

  return NextResponse.json(updated)
}
