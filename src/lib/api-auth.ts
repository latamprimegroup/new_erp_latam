/**
 * Centraliza autenticação e permissões das APIs.
 * Garante consistência e facilita governança.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from './auth'
import { isGlobalKillSwitchActive } from './kill-switch'

export type Role = 'ADMIN' | 'PRODUCER' | 'DELIVERER' | 'FINANCE' | 'COMMERCIAL' | 'CLIENT' | 'MANAGER' | 'PRODUCTION_MANAGER' | 'PLUG_PLAY' | 'PURCHASING'

/** Níveis de acesso para governança granular */
export const ROLE_LEVELS: Record<Role, number> = {
  ADMIN: 100,
  FINANCE: 80,
  COMMERCIAL: 70,
  DELIVERER: 60,
  PRODUCTION_MANAGER: 55,
  PURCHASING: 55,
  PRODUCER: 50,
  MANAGER: 45,
  PLUG_PLAY: 40,
  CLIENT: 10,
}

export type AuthSession = NonNullable<Awaited<ReturnType<typeof getServerSession>>> & {
  user: { id: string; role?: string; name?: string | null; email?: string | null }
}

export type RequireAuthResult =
  | { ok: true; session: AuthSession }
  | { ok: false; response: NextResponse }

/**
 * Exige sessão ativa. Retorna session ou resposta 401.
 */
export async function requireAuth(): Promise<RequireAuthResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    }
  }
  if (session.user.role !== 'ADMIN') {
    const paused = await isGlobalKillSwitchActive()
    if (paused) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Sistema em pausa operacional (kill switch). Contate o administrador.' },
          { status: 503 }
        ),
      }
    }
  }
  return { ok: true, session: session as AuthSession }
}

/**
 * Exige sessão + uma das roles informadas.
 */
export async function requireRoles(
  allowedRoles: Role[]
): Promise<RequireAuthResult> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const userRole = auth.session.user?.role as Role | undefined
  if (!userRole || !allowedRoles.includes(userRole)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
    }
  }
  return auth
}

/**
 * Exige role com nível mínimo (ex: ADMIN ou FINANCE).
 */
export async function requireMinLevel(minLevel: number): Promise<RequireAuthResult> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const userRole = auth.session.user?.role as Role | undefined
  const level = userRole ? ROLE_LEVELS[userRole] ?? 0 : 0
  if (level < minLevel) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
    }
  }
  return auth
}
