import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * POST — Associar UNI à War Room do mentorado.
 * DELETE ?uniId= — revogar acesso.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id: clientId } = await params
  let body: { uniId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const uniId = typeof body.uniId === 'string' ? body.uniId.trim() : ''
  if (!uniId || uniId.length !== 36) {
    return NextResponse.json({ error: 'uniId inválido' }, { status: 400 })
  }

  const client = await prisma.clientProfile.findUnique({ where: { id: clientId }, select: { id: true } })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const uni = await prisma.vaultIndustrialUnit.findUnique({ where: { id: uniId }, select: { id: true } })
  if (!uni) return NextResponse.json({ error: 'UNI não encontrada' }, { status: 404 })

  await prisma.clientMentoradoUniAccess.upsert({
    where: { clientId_uniId: { clientId, uniId } },
    create: { clientId, uniId },
    update: {},
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id: clientId } = await params
  const uniId = req.nextUrl.searchParams.get('uniId')?.trim() ?? ''
  if (!uniId) return NextResponse.json({ error: 'uniId obrigatório' }, { status: 400 })

  try {
    await prisma.clientMentoradoUniAccess.delete({
      where: { clientId_uniId: { clientId, uniId } },
    })
  } catch {
    return NextResponse.json({ error: 'Vínculo não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
