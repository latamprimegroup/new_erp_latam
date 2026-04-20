import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scanCopyComplianceWithOpenAI } from '@/lib/compliance-ai-scan'
import { audit } from '@/lib/audit'

const bodySchema = z.object({
  stockAccountId: z.string().min(1),
  copyText: z.string().min(20),
})

/**
 * POST — grava score em StockAccount.complianceRiskScore; crítico não altera status sozinho (use política na entrega).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const { stockAccountId, copyText } = bodySchema.parse(await req.json())
    const acc = await prisma.stockAccount.findUnique({
      where: { id: stockAccountId },
      select: { id: true },
    })
    if (!acc) return NextResponse.json({ error: 'Conta estoque não encontrada' }, { status: 404 })

    const result = await scanCopyComplianceWithOpenAI(copyText)

    await prisma.stockAccount.update({
      where: { id: stockAccountId },
      data: {
        complianceRiskScore: result.score,
        complianceScannedAt: new Date(),
        complianceScanSummary: JSON.parse(JSON.stringify(result)),
      },
    })

    await audit({
      userId: session.user.id,
      action: 'compliance_ai_scan',
      entity: 'StockAccount',
      entityId: stockAccountId,
      details: {
        score: result.score,
        critical: result.critical,
        safetyScore: (result.raw as { safetyScore?: number } | undefined)?.safetyScore,
      },
    })

    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
