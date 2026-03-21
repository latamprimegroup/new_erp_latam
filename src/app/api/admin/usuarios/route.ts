import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { hash } from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { generateNextClientId } from '@/lib/client-id-sequencial'

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'PRODUCER', 'DELIVERER', 'FINANCE', 'COMMERCIAL', 'CLIENT', 'MANAGER', 'PLUG_PLAY']),
  phone: z.string().optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      createdAt: true,
      clientProfile: { select: { id: true } },
      producerProfile: { select: { id: true } },
      delivererProfile: { select: { id: true } },
      managerProfile: { select: { id: true } },
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      role: u.role,
      createdAt: u.createdAt,
      hasClientProfile: !!u.clientProfile,
      hasProducerProfile: !!u.producerProfile,
      hasDelivererProfile: !!u.delivererProfile,
      hasManagerProfile: !!u.managerProfile,
    }))
  )
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 400 })
    }

    const passwordHash = await hash(data.password, 12)
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        role: data.role,
        phone: data.phone || null,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    })

    if (data.role === 'CLIENT') {
      const clientCode = await generateNextClientId()
      await prisma.clientProfile.create({
        data: { userId: user.id, clientCode },
      })
    } else if (data.role === 'PRODUCER') {
      await prisma.producerProfile.create({
        data: { userId: user.id },
      })
    } else if (data.role === 'DELIVERER') {
      await prisma.delivererProfile.create({
        data: { userId: user.id },
      })
    } else if (data.role === 'MANAGER') {
      await prisma.managerProfile.create({
        data: { userId: user.id },
      })
    }

    await audit({
      userId: session.user.id,
      action: 'user_created',
      entity: 'User',
      entityId: user.id,
      details: { email: user.email, role: user.role },
    })

    return NextResponse.json(user)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao criar usuário' }, { status: 500 })
  }
}
