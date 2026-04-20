import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  dropOffSeconds: z.number().int().min(0).max(86400).nullable().optional(),
  notes: z.string().max(4000).optional().nullable(),
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
    }, 'URL inválida')
    .optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { id } = await params
  const row = await prisma.clienteVslWatch.findFirst({
    where: { id, clientId: client.id },
  })
  if (!row) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const updated = await prisma.clienteVslWatch.update({
    where: { id },
    data: {
      ...(body.dropOffSeconds !== undefined ? { dropOffSeconds: body.dropOffSeconds } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.vslUrl !== undefined ? { vslUrl: body.vslUrl } : {}),
    },
  })

  return NextResponse.json({
    id: updated.id,
    vslUrl: updated.vslUrl,
    dropOffSeconds: updated.dropOffSeconds,
    notes: updated.notes,
    updatedAt: updated.updatedAt.toISOString(),
  })
}
