/**
 * GET /api/receita/consulta?doc=&type=cpf|cnpj
 *
 * Endpoint PÚBLICO (sem autenticação) usado no checkout da loja.
 * CPF  → validação por dígito verificador (sem consulta externa — não existe API pública gratuita).
 * CNPJ → consulta Brasil API → ReceitaWS (fallback) com cache de 1 h.
 *
 * Resposta:
 *   { valid, type, name?, status?, message? }
 */

import { NextResponse } from 'next/server'
import { fetchCnpjReceitaFederal } from '@/lib/receita-federal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Validação algorítmica de CPF ─────────────────────────────────────────────

function validateCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11) return false
  // Rejeita sequências repetidas (111.111.111-11 etc.)
  if (/^(\d)\1{10}$/.test(d)) return false

  const calcDigit = (slice: string, weights: number[]) => {
    const sum = slice.split('').reduce((acc, n, i) => acc + Number(n) * weights[i], 0)
    const rem = sum % 11
    return rem < 2 ? 0 : 11 - rem
  }

  const weights1 = [10, 9, 8, 7, 6, 5, 4, 3, 2]
  const weights2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
  const d1 = calcDigit(d.slice(0, 9), weights1)
  if (d1 !== Number(d[9])) return false
  const d2 = calcDigit(d.slice(0, 10), weights2)
  return d2 === Number(d[10])
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const doc  = (searchParams.get('doc')  ?? '').replace(/\D/g, '')
  const type = (searchParams.get('type') ?? '').toLowerCase()

  // ── CPF ────────────────────────────────────────────────────────────────────
  if (type === 'cpf') {
    if (doc.length !== 11) {
      return NextResponse.json({ valid: false, type: 'CPF', message: 'CPF deve ter 11 dígitos.' })
    }
    const valid = validateCpf(doc)
    return NextResponse.json({
      valid,
      type: 'CPF',
      status: valid ? 'VÁLIDO (dígito verificador OK)' : 'INVÁLIDO',
      message: valid
        ? 'CPF com formato e dígito verificador válidos.'
        : 'CPF inválido — verifique o número informado.',
    })
  }

  // ── CNPJ ───────────────────────────────────────────────────────────────────
  if (type === 'cnpj') {
    if (doc.length !== 14) {
      return NextResponse.json({ valid: false, type: 'CNPJ', message: 'CNPJ deve ter 14 dígitos.' })
    }

    try {
      const data = await fetchCnpjReceitaFederal(doc)
      if (!data) {
        return NextResponse.json({
          valid:   false,
          type:    'CNPJ',
          message: 'CNPJ não encontrado na Receita Federal.',
        })
      }

      const situacao = (data.situacaoCadastral ?? '').toUpperCase()
      const isAtiva  = situacao === 'ATIVA' || situacao.includes('ATIVA')

      return NextResponse.json({
        valid:   isAtiva,
        type:    'CNPJ',
        name:    data.razaoSocial || data.nomeFantasia || undefined,
        status:  data.situacaoCadastral ?? 'Não informado',
        message: isAtiva
          ? `Empresa localizada na Receita Federal${data.municipio ? ` — ${data.municipio}/${data.uf}` : ''}.`
          : `Situação cadastral: ${data.situacaoCadastral}. Verifique com a Receita Federal.`,
      })
    } catch {
      return NextResponse.json({
        valid:   false,
        type:    'CNPJ',
        message: 'Serviço da Receita Federal temporariamente indisponível. Continue com o preenchimento.',
      })
    }
  }

  return NextResponse.json({ valid: false, message: 'Parâmetro type inválido (cpf ou cnpj).' }, { status: 400 })
}
