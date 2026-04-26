/**
 * POST /api/admin/inter-reset-token
 * Limpa o token Inter do banco e força nova autenticação com as credenciais atuais.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!['ADMIN', 'CEO'].includes((session?.user as { role?: string })?.role ?? '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  // Remove token cacheado no banco
  await prisma.systemSetting.deleteMany({
    where: { key: 'inter_oauth_token_cache' },
  }).catch(() => {})

  // Tenta autenticar com as credenciais atuais das variáveis de ambiente
  try {
    const { getInterToken } = await import('@/lib/inter/client')
    // Força nova autenticação
    const token = await getInterToken()
    return NextResponse.json({
      ok: true,
      message: 'Token renovado com sucesso usando as credenciais atuais.',
      tokenPreview: token.slice(0, 20) + '...',
    })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: String((e as Error).message),
      hint: 'Verifique INTER_CLIENT_ID e INTER_CLIENT_SECRET no Vercel.',
    }, { status: 502 })
  }
}

export async function GET() {
  return POST()
}
