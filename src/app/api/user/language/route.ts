import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { APP_LOCALES, normalizeLocale } from '@/lib/i18n-config'

const bodySchema = z.object({
  languageCode: z.string().min(2).max(12),
})

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const json = await req.json()
    const { languageCode: raw } = bodySchema.parse(json)
    const languageCode = normalizeLocale(raw)
    if (!APP_LOCALES.includes(languageCode)) {
      return NextResponse.json({ error: 'Idioma não suportado' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { languageCode },
    })

    return NextResponse.json({ ok: true, languageCode })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao guardar' }, { status: 500 })
  }
}
