import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { runSeedAdmin } from '@/lib/agent/deploy'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const bodySchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
})

async function allowSetupMode(): Promise<boolean> {
  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
  return adminCount === 0
}

/**
 * POST - Cria usuário administrador inicial (apenas quando não existe admin)
 */
export async function POST(req: NextRequest) {
  const canSetup = await allowSetupMode()
  if (!canSetup) {
    const auth = await requireRoles(['ADMIN'])
    if (!auth.ok) return auth.response
  }

  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.errors[0]?.message || 'Dados inválidos' },
      { status: 400 }
    )
  }

  const { email, password } = parsed.data

  try {
    const result = await runSeedAdmin(email, password)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.userMessage },
        { status: 400 }
      )
    }
    return NextResponse.json({ ok: true, message: result.userMessage })
  } catch (err) {
    console.error('Deploy seed error:', err)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar administrador' },
      { status: 500 }
    )
  }
}
