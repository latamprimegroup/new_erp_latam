/**
 * POST /api/compras/fornecedores/[id]/validar-cnpj
 * Valida o CNPJ do fornecedor na Receita Federal via BrasilAPI.
 *
 * Regras de negócio:
 *   - Só libera pagamento de PurchaseOrder se situação = "ATIVA"
 *   - Grava resultado da validação no campo contactInfo do fornecedor
 *   - Cria entrada no AuditLog (ação: cnpj_validation)
 *
 * Acessível apenas para ADMIN e FINANCE.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'FINANCE', 'PURCHASING']

type BrasilApiCnpj = {
  cnpj:            string
  razao_social:    string
  nome_fantasia:   string
  situacao_cadastral: string // '02' = Ativa
  descricao_situacao_cadastral: string
  logradouro:      string
  municipio:       string
  uf:              string
  cep:             string
  porte:           string
  natureza_juridica: string
  capital_social:  number
  qsa:             Array<{ nome_socio: string; qual_socio: string }>
}

function cleanCnpj(raw: string): string {
  return raw.replace(/\D/g, '')
}

function formatCnpj(cnpj: string): string {
  const c = cleanCnpj(cnpj)
  return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12,14)}`
}

function isValidCnpjLength(cnpj: string): boolean {
  return cleanCnpj(cnpj).length === 14
}

export async function POST(req: globalThis.Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const vendor = await prisma.vendor.findUnique({ where: { id: params.id } })
  if (!vendor) return NextResponse.json({ error: 'Fornecedor não encontrado' }, { status: 404 })

  // Tenta obter CNPJ do taxId ou do contactInfo
  const contactInfo = (vendor.contactInfo ?? {}) as Record<string, unknown>
  const rawCnpj = vendor.taxId ?? (contactInfo.cnpj as string) ?? null

  if (!rawCnpj || !isValidCnpjLength(rawCnpj)) {
    return NextResponse.json({
      valid: false,
      error: 'CNPJ não cadastrado ou formato inválido. Atualize o campo Tax ID do fornecedor.',
      hint:  'Formato esperado: XX.XXX.XXX/XXXX-XX ou apenas 14 dígitos',
    }, { status: 422 })
  }

  const cnpjClean = cleanCnpj(rawCnpj)

  try {
    // ── Consulta BrasilAPI (gratuita, sem autenticação) ───────────────────
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjClean}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'ERP-AdsAtivos/1.0' },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({
          valid:   false,
          cnpj:    formatCnpj(cnpjClean),
          status:  'NOT_FOUND',
          message: 'CNPJ não encontrado na Receita Federal.',
        })
      }
      throw new Error(`BrasilAPI retornou ${response.status}`)
    }

    const data = await response.json() as BrasilApiCnpj
    const isActive = data.situacao_cadastral === '02' // 02 = Ativa
    const situacao = data.descricao_situacao_cadastral ?? 'Desconhecida'

    // ── Atualiza fornecedor com resultado da validação ────────────────────
    const updatedContact = {
      ...contactInfo,
      cnpjValidado:       true,
      cnpjStatus:         situacao,
      cnpjAtivo:          isActive,
      razaoSocial:        data.razao_social,
      nomeFantasia:       data.nome_fantasia || null,
      municipio:          `${data.municipio}/${data.uf}`,
      porte:              data.porte,
      naturezaJuridica:   data.natureza_juridica,
      capitalSocial:      data.capital_social,
      ultimaValidacao:    new Date().toISOString(),
      validadoPor:        session.user.email,
    }

    await prisma.vendor.update({
      where: { id: params.id },
      data:  {
        taxId:       formatCnpj(cnpjClean),
        contactInfo: updatedContact,
        // Atualiza rating se CNPJ inativo
        rating: isActive ? Math.max(vendor.rating, 6) : Math.min(vendor.rating, 3),
      },
    })

    // ── Audit log ─────────────────────────────────────────────────────────
    await prisma.auditLog.create({
      data: {
        userId:   session.user.id,
        action:   'cnpj_validation',
        entity:   'Vendor',
        entityId: params.id,
        details: {
          cnpj:    formatCnpj(cnpjClean),
          status:  situacao,
          ativo:   isActive,
          source:  'BrasilAPI',
        },
      },
    })

    const socios = (data.qsa ?? []).slice(0, 3).map((s) => `${s.nome_socio} (${s.qual_socio})`).join(', ')

    return NextResponse.json({
      valid:           isActive,
      cnpj:            formatCnpj(cnpjClean),
      status:          situacao,
      razaoSocial:     data.razao_social,
      nomeFantasia:    data.nome_fantasia || null,
      localizacao:     `${data.municipio}/${data.uf} — CEP ${data.cep}`,
      porte:           data.porte,
      capitalSocial:   data.capital_social,
      socios:          socios || null,
      alert:           isActive
        ? null
        : `⚠️ CNPJ ${situacao} — Bloqueie o pagamento até regularização.`,
      paymentBlocked:  !isActive,
    })

  } catch (err) {
    const msg = (err as Error).message
    // Fallback: se BrasilAPI falhar, tenta ReceitaWS
    try {
      const r2 = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpjClean}`, {
        signal: AbortSignal.timeout(8_000),
      })
      if (r2.ok) {
        const d2 = await r2.json() as { status: string; situacao: string; nome: string; fantasia?: string }
        const active = d2.status === 'OK' && d2.situacao === 'ATIVA'
        return NextResponse.json({
          valid:        active,
          cnpj:         formatCnpj(cnpjClean),
          status:       d2.situacao,
          razaoSocial:  d2.nome,
          nomeFantasia: d2.fantasia || null,
          source:       'ReceitaWS (fallback)',
          paymentBlocked: !active,
        })
      }
    } catch { /* ignore fallback error */ }

    return NextResponse.json({
      valid:   null,
      error:   `Serviço de validação indisponível: ${msg}`,
      hint:    'Tente novamente em alguns minutos ou valide manualmente em cnpj.receita.fazenda.gov.br',
    }, { status: 503 })
  }
}
