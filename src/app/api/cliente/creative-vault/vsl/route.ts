import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  vslUrl: z
    .string()
    .min(12)
    .max(2000)
    .refine((s) => {
      try {
        const u = new URL(s)
        return u.protocol === 'http:' || u.protocol === 'https:'
      } catch {
        return false
      }
    }, 'URL inválida'),
  notes: z.string().max(4000).optional(),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  let body: z.infer<typeof schema>
  try {
    body = schema.parse(await req.json())
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const row = await prisma.clienteVslWatch.create({
    data: {
      clientId: client.id,
      vslUrl: body.vslUrl,
      notes: body.notes?.trim() || null,
    },
  })

  return NextResponse.json({
    id: row.id,
    vslUrl: row.vslUrl,
    dropOffSeconds: row.dropOffSeconds,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  })
}
