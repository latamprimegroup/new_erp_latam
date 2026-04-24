import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export type SessionUserLike = {
  id: string
  role?: string | null
  cargo?: string | null
}

export type ManagedSellerScope =
  | { type: 'all' }
  | { type: 'list'; sellerIds: string[] }
  | { type: 'none' }

type RequireResult =
  | {
      ok: true
      session: {
        user: {
          id: string
          role?: string | null
          cargo?: string | null
          leaderId?: string | null
          name?: string | null
          email?: string | null
        }
      }
    }
  | { ok: false; response: NextResponse }

function normalizeCargo(cargo?: string | null): string {
  return (cargo || '').trim().toUpperCase()
}

export function canManageCommercialTeam(role?: string | null, cargo?: string | null): boolean {
  if (role === 'ADMIN') return true
  if (role !== 'COMMERCIAL') return false
  const c = normalizeCargo(cargo)
  return (
    c.includes('GERENTE') ||
    c.includes('HEAD') ||
    c === 'MANAGER'
  )
}

export function isCommercialManager(user: SessionUserLike): boolean {
  return canManageCommercialTeam(user.role, user.cargo)
}

export function isCommercialSeller(user: SessionUserLike): boolean {
  if (user.role !== 'COMMERCIAL') return false
  const c = normalizeCargo(user.cargo)
  if (!c) return true
  return c.includes('VENDEDOR') && !c.includes('GERENTE')
}

export function getCommercialTeamScope(
  userId: string,
  role?: string | null,
  cargo?: string | null,
): { allTeam: boolean; includeSelf: boolean; managerId: string } {
  if (role === 'ADMIN') {
    return { allTeam: true, includeSelf: false, managerId: userId }
  }
  return {
    allTeam: false,
    includeSelf: canManageCommercialTeam(role, cargo),
    managerId: userId,
  }
}

export async function getCommercialTeamIds(managerUserId: string): Promise<string[]> {
  const members = await prisma.user.findMany({
    where: {
      role: 'COMMERCIAL',
      OR: [{ leaderId: managerUserId }, { id: managerUserId }],
    },
    select: { id: true },
  })
  return members.map((m) => m.id)
}

export async function resolveManagedSellerIds(
  userId: string,
  role?: string | null,
): Promise<ManagedSellerScope> {
  if (role === 'ADMIN') return { type: 'all' }
  if (role !== 'COMMERCIAL') return { type: 'none' }

  const sellers = await prisma.user.findMany({
    where: {
      role: 'COMMERCIAL',
      OR: [{ leaderId: userId }, { id: userId }],
    },
    select: { id: true },
  })
  const ids = sellers.map((s) => s.id)
  if (ids.length === 0) return { type: 'none' }
  return { type: 'list', sellerIds: ids }
}

async function requireSessionFromRequest(): Promise<RequireResult> {
  const { authOptions } = await import('@/lib/auth')
  const { getServerSession } = await import('next-auth/next')
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }
  }
  return {
    ok: true,
    session: {
      user: {
        id: session.user.id,
        role: session.user.role,
        cargo: session.user.cargo,
        leaderId: session.user.leaderId,
        name: session.user.name,
        email: session.user.email,
      },
    },
  }
}

export async function requireCommercialManagerAccess(): Promise<RequireResult> {
  const auth = await requireSessionFromRequest()
  if (!auth.ok) return auth

  if (!canManageCommercialTeam(auth.session.user.role, auth.session.user.cargo)) {
    return { ok: false, response: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  }
  return auth
}

export async function requireCommercialManagerOrAdmin(): Promise<RequireResult> {
  return requireCommercialManagerAccess()
}

export async function requireSalesManagerAccess(): Promise<RequireResult> {
  return requireCommercialManagerAccess()
}

