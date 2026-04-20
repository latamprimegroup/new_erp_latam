/**
 * GET/PATCH — página gerada (HTML/CSS + campos ecossistema) — Monaco / Lander Builder.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

const patchSchema = z.object({
  html: z.string().max(2_000_000).optional(),
  css: z.string().max(500_000).optional().nullable(),
  templateMode: z.enum(['WHITE', 'BLACK']).optional(),
  vturbEmbed: z.string().max(50_000).optional().nullable(),
  footerHtml: z.string().max(20_000).optional().nullable(),
  pageTrackingScript: z.string().max(100_000).optional().nullable(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const page = await prisma.landingPage.findFirst({
    where: { id, clientId: client.id },
    include: {
      briefing: {
        select: { id: true, nomeEmpresa: true, templateMode: true },
      },
    },
  })
  if (!page) return NextResponse.json({ error: 'Página não encontrada' }, { status: 404 })

  return NextResponse.json({ page })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const existing = await prisma.landingPage.findFirst({
    where: { id, clientId: client.id },
  })
  if (!existing) return NextResponse.json({ error: 'Página não encontrada' }, { status: 404 })

  try {
    const body = patchSchema.parse(await req.json())
    const data: Prisma.LandingPageUpdateInput = {}
    if (body.html !== undefined) data.html = body.html
    if (body.css !== undefined) data.css = body.css
    if (body.templateMode !== undefined) data.templateMode = body.templateMode
    if (body.vturbEmbed !== undefined) data.vturbEmbed = body.vturbEmbed
    if (body.footerHtml !== undefined) data.footerHtml = body.footerHtml
    if (body.pageTrackingScript !== undefined) data.pageTrackingScript = body.pageTrackingScript
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
    }

    const page = await prisma.landingPage.update({
      where: { id },
      data,
    })
    return NextResponse.json({ page })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    throw e
  }
}
