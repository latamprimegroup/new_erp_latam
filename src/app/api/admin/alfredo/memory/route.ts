/**
 * GET  /api/admin/alfredo/memory — Lista memórias
 * POST /api/admin/alfredo/memory — Salva nota/memória
 * DELETE /api/admin/alfredo/memory?id=xxx — Remove memória
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { AlfredoMemoryType } from '@prisma/client'

const createSchema = z.object({
  type:    z.enum(['NOTE', 'INSIGHT', 'TASK_ANALYSIS', 'BRIEFING', 'CHAT_SUMMARY']).default('NOTE'),
  title:   z.string().max(300).optional(),
  content: z.string().min(1).max(5000),
  pinned:  z.boolean().default(false),
})

export async function GET(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const pinned = searchParams.get('pinned') === 'true'
  const type   = searchParams.get('type') as AlfredoMemoryType | null

  const memories = await prisma.alfredoMemory.findMany({
    where: {
      ...(pinned && { pinned: true }),
      ...(type && { type }),
    },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take:    50,
  })

  return NextResponse.json(memories)
}

export async function POST(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })

  const memory = await prisma.alfredoMemory.create({
    data: { ...parsed.data, type: parsed.data.type as AlfredoMemoryType, userId: session.user.id },
  })
  return NextResponse.json(memory, { status: 201 })
}

export async function DELETE(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  await prisma.alfredoMemory.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
