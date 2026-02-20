import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET - Health check detalhado (para admin/diagnóstico)
 * Retorna status de DB, env vars (mascaradas), versão
 */
export async function GET() {
  try {
    const start = Date.now()
    await prisma.$queryRaw`SELECT 1`
    const dbLatency = Date.now() - start

    const envCheck = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
      NEXTAUTH_URL: !!process.env.NEXTAUTH_URL,
      ENCRYPTION_KEY: !!process.env.ENCRYPTION_KEY,
      CRON_SECRET: !!process.env.CRON_SECRET,
      VAPID_PUBLIC: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    }

    const versionSetting = await prisma.systemSetting.findUnique({
      where: { key: 'erp_version' },
    })

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      db: { connected: true, latencyMs: dbLatency },
      env: envCheck,
      version: versionSetting?.value || '0.1.0',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      {
        ok: false,
        timestamp: new Date().toISOString(),
        error: msg,
      },
      { status: 503 }
    )
  }
}
