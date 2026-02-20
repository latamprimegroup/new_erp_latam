import { NextResponse } from 'next/server'
import { z } from 'zod'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { token, password } = schema.parse(body)

    const record = await prisma.passwordResetToken.findUnique({
      where: { token },
    })

    if (!record || record.usedAt || new Date() > record.expiresAt) {
      return NextResponse.json({ error: 'Link inválido ou expirado' }, { status: 400 })
    }

    const passwordHash = await hash(password, 12)
    await prisma.user.update({
      where: { email: record.email },
      data: { passwordHash },
    })
    await prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    })

    return NextResponse.json({ message: 'Senha alterada. Faça login.' })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Erro ao processar' }, { status: 500 })
  }
}
