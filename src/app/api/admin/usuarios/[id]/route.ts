import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { hash } from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'PRODUCER', 'DELIVERER', 'FINANCE', 'COMMERCIAL', 'CLIENT', 'MANAGER', 'PLUG_PLAY']).optional(),
  phone: z.string().optional().nullable(),
  password: z.string().min(8).optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const user = await prisma.user.findUnique({
    where: { id },
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
  })
  if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  return NextResponse.json({
    ...user,
    hasClientProfile: !!user.clientProfile,
    hasProducerProfile: !!user.producerProfile,
    hasDelivererProfile: !!user.delivererProfile,
    hasManagerProfile: !!user.managerProfile,
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    if (data.email && data.email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: data.email } })
      if (existing) {
        return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 400 })
      }
    }

    const updateData: Record<string, unknown> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.email !== undefined) updateData.email = data.email
    if (data.role !== undefined) updateData.role = data.role
    if (data.phone !== undefined) updateData.phone = data.phone
    if (data.password) updateData.passwordHash = await hash(data.password, 12)

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, phone: true },
    })

    if (data.role !== undefined && data.role !== user.role) {
      const rolesNeedProfile = ['CLIENT', 'PRODUCER', 'DELIVERER', 'MANAGER'] as const
      for (const r of rolesNeedProfile) {
        if (data.role === r) {
          const profileField = {
            CLIENT: 'clientProfile',
            PRODUCER: 'producerProfile',
            DELIVERER: 'delivererProfile',
            MANAGER: 'managerProfile',
          }[r] as 'clientProfile' | 'producerProfile' | 'delivererProfile' | 'managerProfile'
          const existing = await prisma.user.findUnique({
            where: { id },
            include: { [profileField]: true },
          })
          const profile = (existing as Record<string, unknown>)?.[profileField]
          if (!profile) {
            if (r === 'CLIENT') await prisma.clientProfile.create({ data: { userId: id } })
            else if (r === 'PRODUCER') await prisma.producerProfile.create({ data: { userId: id } })
            else if (r === 'DELIVERER') await prisma.delivererProfile.create({ data: { userId: id } })
            else if (r === 'MANAGER') await prisma.managerProfile.create({ data: { userId: id } })
          }
        }
      }
    }

    await audit({
      userId: session.user?.id,
      action: 'user_updated',
      entity: 'User',
      entityId: id,
      details: { changes: Object.keys(updateData) },
    })

    return NextResponse.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}
