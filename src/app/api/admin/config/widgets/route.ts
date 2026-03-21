import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: ['joinchat_id', 'whatsapp_number'] } },
  })
  const config = Object.fromEntries(settings.map((s) => [s.key, s.value]))

  return NextResponse.json({
    joinchatId: config.joinchat_id || '',
    whatsappNumber: config.whatsapp_number || '',
  })
}

const updateSchema = z.object({
  joinchatId: z.string().optional(),
  whatsappNumber: z.string().optional(),
})

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    if (data.joinchatId !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key: 'joinchat_id' },
        create: { key: 'joinchat_id', value: data.joinchatId },
        update: { value: data.joinchatId },
      })
    }
    if (data.whatsappNumber !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key: 'whatsapp_number' },
        create: { key: 'whatsapp_number', value: data.whatsappNumber },
        update: { value: data.whatsappNumber },
      })
    }

    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: ['joinchat_id', 'whatsapp_number'] } },
    })
    const config = Object.fromEntries(settings.map((s) => [s.key, s.value]))

    return NextResponse.json({
      joinchatId: config.joinchat_id || '',
      whatsappNumber: config.whatsapp_number || '',
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    throw err
  }
}
