/**
 * GET /api/version
 *
 * Endpoint público de diagnóstico de versão.
 * Usado para confirmar qual build está rodando em produção:
 *   curl https://www.adsativos.com/api/version
 *
 * Retorna: buildVersion, deployId, nodeEnv, timestamp
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    app:          'War Room OS — Ads Ativos',
    buildVersion: process.env.NEXT_PUBLIC_BUILD_VERSION ?? 'dev',
    deployId:     process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'local',
    gitCommit:    process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    gitBranch:    process.env.VERCEL_GIT_COMMIT_REF ?? 'local',
    nodeEnv:      process.env.NODE_ENV,
    region:       process.env.VERCEL_REGION ?? 'local',
    timestamp:    new Date().toISOString(),
  }, {
    headers: {
      'Cache-Control': 'no-store, must-revalidate',
    },
  })
}
