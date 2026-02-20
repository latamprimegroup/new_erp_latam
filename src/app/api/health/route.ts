import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET - Health check (público)
 * Usado por load balancers, monitoramento, deploy agent
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({
      ok: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json(
      { ok: false, status: 'unhealthy', timestamp: new Date().toISOString() },
      { status: 503 }
    )
  }
}
