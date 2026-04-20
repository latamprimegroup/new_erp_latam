import { NextResponse } from 'next/server'
import { z } from 'zod'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { audit } from '@/lib/audit'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

function canRead(role: string | undefined, userId: string, asset: { producerId: string | null }) {
  if (isGerente(role)) return true
  if (role === 'PRODUCER' && asset.producerId === userId) return true
  return false
}

const tabSchema = z.enum(['cnpj', 'rg-frente', 'rg-verso', 'briefing'])

const bodySchema = z.object({
  /** Troca explícita de aba no painel de documentos (Bloco 5) */
  documentTab: tabSchema.optional(),
})

const DOC_LABEL: Record<z.infer<typeof tabSchema>, string> = {
  cnpj: 'Cartão CNPJ',
  'rg-frente': 'RG frente',
  'rg-verso': 'RG verso',
  briefing: 'Briefing do nicho',
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const { id } = await params
  const asset = await prisma.adsCoreAsset.findUnique({ where: { id } })
  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })
  if (!canRead(auth.session.user.role, auth.session.user.id, asset)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = bodySchema.parse(await req.json())
    if (!body.documentTab) {
      return NextResponse.json({ error: 'Informe documentTab' }, { status: 400 })
    }

    const h = await headers()
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined

    await audit({
      userId: auth.session.user.id,
      action: 'ads_core_document_tab_viewed',
      entity: 'AdsCoreAsset',
      entityId: id,
      ip,
      details: {
        documentTab: body.documentTab,
        documentLabel: DOC_LABEL[body.documentTab],
      },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
