import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'FINANCE']

const patchSchema = z.object({
  name:        z.string().min(2).max(120).optional(),
  bankName:    z.string().max(100).optional().nullable(),
  accountType: z.enum(['CHECKING', 'SAVINGS', 'DIGITAL', 'CREDIT', 'CRIPTO']).optional(),
  currency:    z.string().max(10).optional(),
  balance:     z.number().optional(),
  icon:        z.string().max(10).optional().nullable(),
  color:       z.string().max(20).optional().nullable(),
  notes:       z.string().max(500).optional().nullable(),
  active:      z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const wallet = await prisma.finWallet.findUnique({ where: { id: params.id } })
  if (!wallet) return NextResponse.json({ error: 'Carteira não encontrada' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const updated = await prisma.finWallet.update({
    where: { id: params.id },
    data: {
      ...parsed.data,
      ...(parsed.data.balance !== undefined ? { balance: parsed.data.balance } : {}),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  await prisma.finWallet.update({ where: { id: params.id }, data: { active: false } })
  return NextResponse.json({ success: true })
}
