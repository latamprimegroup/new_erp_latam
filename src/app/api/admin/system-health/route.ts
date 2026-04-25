/**
 * GET /api/admin/system-health
 * Verifica todas as variáveis de ambiente críticas e conectividade.
 * Usado pelo painel CEO para diagnóstico rápido antes de deploys.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type CheckResult = {
  name: string
  status: 'ok' | 'missing' | 'partial' | 'error'
  detail?: string
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const checks: CheckResult[] = []
  const env = process.env

  // ── Database ──────────────────────────────────────────────────────────────
  const dbUrl = env.DATABASE_URL
  checks.push({
    name: 'DATABASE_URL',
    status: dbUrl && !dbUrl.startsWith('mysql://ci:') ? 'ok' : 'missing',
    detail: dbUrl ? `${dbUrl.slice(0, 20)}...` : undefined,
  })

  // ── NextAuth ──────────────────────────────────────────────────────────────
  checks.push({
    name: 'NEXTAUTH_SECRET',
    status: env.NEXTAUTH_SECRET ? 'ok' : 'missing',
  })
  checks.push({
    name: 'NEXTAUTH_URL',
    status: env.NEXTAUTH_URL ? 'ok' : 'partial',
    detail: env.NEXTAUTH_URL ?? 'não definida (usa VERCEL_URL como fallback)',
  })

  // ── Banco Inter ───────────────────────────────────────────────────────────
  const interVars = ['INTER_CLIENT_ID', 'INTER_CLIENT_SECRET', 'INTER_ACCOUNT_KEY', 'INTER_CERT_BASE64', 'INTER_KEY_BASE64']
  const interPresent = interVars.filter((v) => !!env[v])
  checks.push({
    name: 'Banco Inter (certificados + credenciais)',
    status: interPresent.length === interVars.length ? 'ok' : interPresent.length > 0 ? 'partial' : 'missing',
    detail: `${interPresent.length}/${interVars.length} variáveis configuradas: ${interPresent.join(', ') || 'nenhuma'}`,
  })

  // ── OpenAI ────────────────────────────────────────────────────────────────
  checks.push({
    name: 'OPENAI_API_KEY',
    status: env.OPENAI_API_KEY ? 'ok' : 'missing',
    detail: env.OPENAI_API_KEY ? 'configurada' : 'ALFREDO usará regex como fallback',
  })

  // ── Utmify ────────────────────────────────────────────────────────────────
  checks.push({
    name: 'UTMIFY_API_TOKEN',
    status: env.UTMIFY_API_TOKEN ? 'ok' : 'missing',
    detail: env.UTMIFY_API_TOKEN ? 'configurada' : 'postbacks de conversão desativados',
  })

  // ── WhatsApp (Evolution / Z-API) ──────────────────────────────────────────
  const waVars = ['EVOLUTION_API_URL', 'EVOLUTION_API_KEY', 'EVOLUTION_INSTANCE']
  const waPresent = waVars.filter((v) => !!env[v])
  checks.push({
    name: 'WhatsApp (Evolution API)',
    status: waPresent.length === waVars.length ? 'ok' : waPresent.length > 0 ? 'partial' : 'missing',
    detail: `${waPresent.length}/${waVars.length}: ${waPresent.join(', ') || 'nenhuma'}`,
  })

  // ── Banco de dados (conectividade) ────────────────────────────────────────
  try {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$queryRaw`SELECT 1`
    checks.push({ name: 'Conexão com MySQL', status: 'ok' })
  } catch (err) {
    checks.push({ name: 'Conexão com MySQL', status: 'error', detail: String(err).slice(0, 200) })
  }

  const missing  = checks.filter((c) => c.status === 'missing').length
  const errors   = checks.filter((c) => c.status === 'error').length
  const partials = checks.filter((c) => c.status === 'partial').length

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    overall: errors > 0 ? 'error' : missing > 2 ? 'degraded' : partials > 0 ? 'partial' : 'ok',
    checks,
    summary: { ok: checks.filter((c) => c.status === 'ok').length, missing, errors, partials },
  })
}
