/**
 * GET - Listar colaboradores que podem participar de onboarding (staff, com email)
 * Usado para seleção de participantes na agenda
 */
import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const ONBOARDING_ROLES = ['ADMIN', 'COMMERCIAL', 'DELIVERER', 'PRODUCER', 'FINANCE', 'MANAGER', 'PRODUCTION_MANAGER'] as const

export async function GET() {
  const auth = await requireRoles([...ONBOARDING_ROLES])
  if (!auth.ok) return auth.response

  const users = await prisma.user.findMany({
    where: {
      role: { not: 'CLIENT' },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(users)
}
