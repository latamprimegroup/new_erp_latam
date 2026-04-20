import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { getClientIdentifier, withRateLimit } from '@/lib/rate-limit-api'

const schema = z.object({ email: z.string().email() })

export async function POST(req: Request) {
  const limited = withRateLimit(req, `forgot:${getClientIdentifier(req)}`, { max: 3, windowMs: 60_000 })
  if (limited) return limited

  try {
    const body = await req.json()
    const { email } = schema.parse(body)

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'E-mail não encontrado' }, { status: 400 })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    await prisma.passwordResetToken.deleteMany({ where: { email } })
    await prisma.passwordResetToken.create({
      data: { email, token, expiresAt },
    })

    let requestOrigin = ''
    try {
      requestOrigin = new URL(req.url).origin
    } catch {
      /* ignore */
    }
    const baseUrl =
      process.env.NEXTAUTH_URL?.trim() ||
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      requestOrigin ||
      'http://localhost:3000'
    const resetLink = `${baseUrl}/redefinir-senha?token=${token}`

    // TODO: enviar e-mail com resetLink (nodemailer, Resend, etc.)
    // Por enquanto retornamos o link em dev (não fazer em produção)
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json({ message: 'Link gerado (apenas dev)', resetLink })
    }

    return NextResponse.json({ message: 'Se o e-mail existir, você receberá o link para redefinir a senha.' })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Erro ao processar' }, { status: 500 })
  }
}
