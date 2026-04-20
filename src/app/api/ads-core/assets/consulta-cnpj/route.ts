import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { consultarCnpjReceita } from '@/lib/receita-federal-mock'
import { ADS_CORE_RECEITA_NAO_ATIVA_MSG, isReceitaSituacaoAtiva } from '@/lib/ads-core-cnae'
import { normalizeAdsCoreCnpj } from '@/lib/ads-core-utils'

const schema = z.object({ cnpj: z.string().min(8) })

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const role = auth.session.user.role
  if (!['ADMIN', 'PRODUCTION_MANAGER', 'PRODUCER'].includes(role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  try {
    const { cnpj } = schema.parse(await req.json())
    const digits = normalizeAdsCoreCnpj(cnpj)
    if (digits.length !== 14) {
      return NextResponse.json({ error: 'Informe um CNPJ com 14 dígitos' }, { status: 400 })
    }
    const data = await consultarCnpjReceita(digits)
    if (!data) {
      return NextResponse.json(
        {
          error:
            'Não foi possível consultar o CNPJ. Configure RECEITAWS_API_TOKEN ou outro provedor (CNPJ.ws / API custom) e tente novamente.',
          code: 'CNPJ_CONSULTA_INDISPONIVEL',
        },
        { status: 502 }
      )
    }
    if (process.env.ADS_CORE_REQUIRE_REAL_CNPJ === 'true' && data.source === 'mock') {
      return NextResponse.json(
        {
          error:
            'Dados simulados bloqueados: defina RECEITAWS_API_TOKEN (ReceitaWS) ou remova ADS_CORE_REQUIRE_REAL_CNPJ para desenvolvimento.',
          code: 'CNPJ_MOCK_BLOQUEADO',
        },
        { status: 503 }
      )
    }
    if (!isReceitaSituacaoAtiva(data.statusReceita)) {
      return NextResponse.json(
        {
          error: `${ADS_CORE_RECEITA_NAO_ATIVA_MSG} (situação: ${data.statusReceita}).`,
          code: 'RECEITA_NAO_ATIVA',
        },
        { status: 400 }
      )
    }
    return NextResponse.json(data)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
