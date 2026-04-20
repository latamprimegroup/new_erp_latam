import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Snapshot agregado para a home pública (sem lista de contas).
 * Ative apenas com PUBLIC_STOCK_SNAPSHOT_ENABLED=true no servidor.
 */
export async function GET() {
  if (process.env.PUBLIC_STOCK_SNAPSHOT_ENABLED !== 'true') {
    return NextResponse.json({ enabled: false as const })
  }

  try {
    const available = await prisma.stockAccount.count({
      where: {
        deletedAt: null,
        archivedAt: null,
        status: 'AVAILABLE',
        clientId: null,
      },
    })

    return NextResponse.json({
      enabled: true as const,
      available,
      /** Faixa para exibição (“discreta”): não expõe lista nem detalhes */
      label:
        available === 0
          ? 'sob_consulta'
          : available <= 10
            ? 'exact'
            : available <= 50
              ? 'amplo'
              : 'muito_amplo',
    })
  } catch (e) {
    console.error('stock-snapshot', e)
    return NextResponse.json({ enabled: false as const, error: 'indisponivel' }, { status: 503 })
  }
}
