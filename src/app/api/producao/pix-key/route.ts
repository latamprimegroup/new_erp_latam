import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  pixKey: z.string().max(120),
})

/**
 * Produtor cadastra ou atualiza a chave PIX usada nos pagamentos de saque.
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (session.user.role !== 'PRODUCER') {
    return NextResponse.json({ error: 'Apenas produtores podem alterar a chave PIX' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { pixKey: raw } = bodySchema.parse(body)
    const pixKey = raw.trim() || null

    await prisma.producerProfile.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, pixKey },
      update: { pixKey },
    })

    return NextResponse.json({ ok: true, pixKey })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Dados inválidos' }, { status: 400 })
    }
    throw e
  }
}
