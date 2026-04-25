/**
 * POST /api/cliente/select-profile
 *
 * Grava o perfil selecionado pelo cliente no cookie `selected_profile`.
 * Usado pelo ProfileSelector quando o usuário tem múltiplos perfis.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { ClientProfileType } from '@prisma/client'

const schema = z.object({
  profileType: z.string(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Perfil inválido' }, { status: 400 })
  }

  const { profileType } = parsed.data

  // Verifica se o cliente possui esse perfil
  const cp = await prisma.clientProfile.findUnique({
    where:  { userId: session.user.id },
    select: { ownedProfiles: true },
  })

  const owned: ClientProfileType[] = Array.isArray(cp?.ownedProfiles)
    ? (cp!.ownedProfiles as ClientProfileType[])
    : []

  if (owned.length > 0 && !owned.includes(profileType as ClientProfileType)) {
    return NextResponse.json({ error: 'Perfil não autorizado' }, { status: 403 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('selected_profile', profileType, {
    path:     '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 30, // 30 dias
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('selected_profile')
  return res
}
