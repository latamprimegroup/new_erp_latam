import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { runGuardComplianceScan, type GuardMediaType } from '@/lib/guard-compliance-engine'

const bodySchema = z.object({
  text: z.string().min(10),
  tipoMidia: z.enum(['COPY', 'LP', 'VSL']).default('COPY'),
  stockAccountId: z.string().optional(),
  persistHistory: z.boolean().optional().default(true),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = bodySchema.parse(await req.json())
    const result = await runGuardComplianceScan({
      text: body.text,
      tipoMidia: body.tipoMidia as GuardMediaType,
      stockAccountId: body.stockAccountId ?? null,
      persistHistory: body.persistHistory,
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    throw e
  }
}
