/**
 * GET /api/admin/god-view
 *
 * CEO God View — o ADMIN entra no modo de visualização de um perfil de cliente.
 * Grava um cookie `god_view_profile` com o profileType e redireciona para
 * /dashboard/cliente para que o layout renderize com aquele tema.
 *
 * DELETE /api/admin/god-view — limpa o cookie e sai do God View
 *
 * Query params (GET):
 *   profileType — ClientProfileType a simular
 *   label       — Nome legível (ex.: "João Silva — Mentorado VIP")
 *   clientId    — (opcional) ID do usuário para simular exatamente
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

const COOKIE_NAME    = 'god_view_profile'
const COOKIE_MAX_AGE = 60 * 60 * 4 // 4 horas

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const profileType = searchParams.get('profileType') ?? 'TRADER_WHATSAPP'
  const label       = searchParams.get('label') ?? profileType
  const clientId    = searchParams.get('clientId') ?? null

  const payload = JSON.stringify({ profileType, label, clientId })

  const res = NextResponse.redirect(new URL('/dashboard/cliente', req.url))
  res.cookies.set(COOKIE_NAME, payload, {
    httpOnly: false,          // deve ser legível pelo layout server component
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   COOKIE_MAX_AGE,
    path:     '/',
  })
  return res
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
  return res
}
