import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** Estado do Welcome Experience (equivalente a first_login no Supabase). */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: {
      welcomeOnboardingPending: true,
      user: { select: { name: true, email: true } },
    },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const videoUrl = (process.env.NEXT_PUBLIC_WAR_ROOM_WELCOME_VIDEO_URL || '').trim() || null
  const userName =
    client.user?.name?.trim() ||
    client.user?.email?.split('@')[0]?.trim() ||
    'Operador'

  return NextResponse.json({
    pending: client.welcomeOnboardingPending,
    userName,
    videoUrl,
  })
}
