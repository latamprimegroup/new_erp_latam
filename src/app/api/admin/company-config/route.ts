/**
 * GET  /api/admin/company-config — Configurações financeiras da empresa
 * PATCH /api/admin/company-config — Atualiza configurações (apenas ADMIN)
 *
 * Gerencia o singleton CompanyConfig:
 *   - Safety Buffer (meses de despesas fixas)
 *   - War Fund (fundo de oportunidade)
 *   - Tax Provision %
 *   - Reinvest %
 *   - EBITDA Multiple
 *   - Revenue Target
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z }                from 'zod'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'

async function getOrCreate() {
  return prisma.companyConfig.upsert({
    where:  { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const config = await getOrCreate()
  return NextResponse.json(config)
}

const patchSchema = z.object({
  safetyBufferMonths: z.number().int().min(0).max(24).optional(),
  warFundAmount:      z.number().min(0).optional(),
  taxProvisionPct:    z.number().min(0).max(100).optional(),
  reinvestPct:        z.number().min(0).max(100).optional(),
  ebitdaMultiple:     z.number().int().min(1).max(100).optional(),
  revenueTarget:      z.number().min(0).optional(),
})

export async function PATCH(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const config = await prisma.companyConfig.upsert({
    where:  { id: 'singleton' },
    update: { ...parsed.data, updatedBy: session.user.email ?? session.user.id },
    create: { id: 'singleton', ...parsed.data, updatedBy: session.user.email ?? session.user.id },
  })

  // Grava na memória da ALFREDO IA
  await prisma.alfredoMemory.create({
    data: {
      type:    'INSIGHT',
      title:   '⚙️ CompanyConfig atualizado',
      content: `Configurações financeiras atualizadas por ${session.user.email}. Parâmetros: ${JSON.stringify(parsed.data)}`,
      userId:  session.user.id,
    },
  }).catch(() => null)

  return NextResponse.json(config)
}
