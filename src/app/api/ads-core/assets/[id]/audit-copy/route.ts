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

const schema = z.object({
  field: z.enum([
    'cnpj',
    'razaoSocial',
    'nomeFantasia',
    'endereco',
    'enderecoCompleto',
    'logradouro',
    'numero',
    'bairro',
    'cidade',
    'estado',
    'cep',
    'nomeSocio',
    'cpfSocio',
    'dataNascimentoSocio',
    'emailEmpresa',
    'telefone',
    'cnae',
    'cnaeDescricao',
    'siteUrl',
    'statusReceita',
    'statusProducao',
    'nicheName',
    'briefingInstructions',
    'congruenciaCheck',
    /** Texto agregado CNPJ + razão + endereço + e-mail para rodapé do site */
    'rodapeSite',
  ]),
})

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
    const { field } = schema.parse(await req.json())
    const h = await headers()
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined

    await audit({
      userId: auth.session.user.id,
      action: 'ads_core_field_copied',
      entity: 'AdsCoreAsset',
      entityId: id,
      details: { field, label: `Copiou campo: ${field}` },
      ip,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
