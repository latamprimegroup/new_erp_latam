import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  country: z.string().optional(),
  notifyEmail: z.boolean().optional(),
  notifyWhatsapp: z.boolean().optional(),
  photo: z.string().url().optional().nullable(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const [user, client] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user!.id },
      select: { id: true, email: true, name: true, phone: true, photo: true },
    }),
    prisma.clientProfile.findUnique({
      where: { userId: session.user!.id },
    }),
  ])

  if (!user || !client) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

  return NextResponse.json({
    ...user,
    whatsapp: client.whatsapp,
    country: client.country,
    notifyEmail: client.notifyEmail,
    notifyWhatsapp: client.notifyWhatsapp,
  })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    await prisma.user.update({
      where: { id: session.user!.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.phone && { phone: data.phone }),
        ...(data.photo !== undefined && { photo: data.photo }),
      },
    })

    const client = await prisma.clientProfile.findUnique({
      where: { userId: session.user!.id },
    })
    if (client) {
      await prisma.clientProfile.update({
        where: { id: client.id },
        data: {
          ...(data.whatsapp !== undefined && { whatsapp: data.whatsapp }),
          ...(data.country !== undefined && { country: data.country }),
          ...(data.notifyEmail !== undefined && { notifyEmail: data.notifyEmail }),
          ...(data.notifyWhatsapp !== undefined && { notifyWhatsapp: data.notifyWhatsapp }),
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}
