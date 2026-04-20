import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const xf = req.headers.get('x-forwarded-for') || ''
  const ip = xf.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'ip-indisponivel'
  return NextResponse.json({ ip })
}
