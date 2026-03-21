import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getClientIdentifier, withRateLimit } from '@/lib/rate-limit-api'
import { generateNextClientId } from '@/lib/client-id-sequencial'

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  whatsapp: z.string().optional(),
})

export async function POST(req: Request) {
  const limited = withRateLimit(req, `register:${getClientIdentifier(req)}`, { max: 5, windowMs: 60_000 })
  if (limited) return limited

  try {
    const body = await req.json()
    const { email, name, password, whatsapp } = schema.parse(body)

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: 'E-mail já cadastrado' },
        { status: 400 }
      )
    }

    const passwordHash = await hash(password, 12)
    const clientCode = await generateNextClientId()

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        phone: whatsapp,
        role: 'CLIENT',
      },
    })

    await prisma.clientProfile.create({
      data: {
        userId: user.id,
        clientCode,
        whatsapp: whatsapp || null,
      },
    })

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.errors[0].message },
        { status: 400 }
      )
    }
    console.error(err)
    return NextResponse.json(
      { error: 'Erro ao cadastrar' },
      { status: 500 }
    )
  }
}
