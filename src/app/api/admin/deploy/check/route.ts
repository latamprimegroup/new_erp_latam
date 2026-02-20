import { NextResponse } from 'next/server'
import { runInitialCheck } from '@/lib/agent/deploy'

/**
 * GET - Verificação inicial do ambiente (deploy)
 * Público — apenas leitura, retorna diagnóstico
 */
export async function GET() {
  try {
    const status = await runInitialCheck()
    return NextResponse.json(status)
  } catch (err) {
    console.error('Deploy check error:', err)
    return NextResponse.json(
      {
        canDeploy: false,
        currentVersion: '0',
        steps: [],
        nextStep: null,
        productionActive: false,
        error: err instanceof Error ? err.message : 'Erro ao verificar',
      },
      { status: 500 }
    )
  }
}
