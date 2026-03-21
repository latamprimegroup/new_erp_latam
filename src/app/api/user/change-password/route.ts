import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  currentPassword: z.string().min(1, 'Senha atual obrigatória'),
  newPassword: z.string().min(8, 'Nova senha deve ter no mínimo 8 caracteres'),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const body = await req.json()
    const { currentPassword, newPassword } = schema.parse(body)

    const user = await prisma.user.findUnique({
      where: { id: session.user!.id },
      select: { passwordHash: true },
    })
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    if (!user.passwordHash) {
      return NextResponse.json({ error: 'Conta sem senha (login social). Use recuperar senha.' }, { status: 400 })
    }

    const { compare } = await import('bcryptjs')
    const valid = await compare(currentPassword, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 400 })
    }

    const passwordHash = await hash(newPassword, 12)
    await prisma.user.update({
      where: { id: session.user!.id },
      data: { passwordHash },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Erro ao alterar senha' }, { status: 500 })
  }
}
