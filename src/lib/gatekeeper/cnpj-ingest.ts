import type { CnpjNormalized } from '@/lib/receita-federal'
import { CNPJ_SITUACAO_ATIVA_RE, fetchCnpjBrasilApiNoStore } from '@/lib/receita-federal'
import type { VaultGeofencing } from '@/lib/gatekeeper/types'

export function normalizeCnpjDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 14)
}

/**
 * Inferência heurística de nicho a partir do CNAE / descrição (ex.: Saúde/Nutra).
 */
export function inferNicheFromCnae(cnae: string, descricao: string | null): string {
  const code = cnae.replace(/\D/g, '')
  const d = (descricao || '').toLowerCase()

  if (/suplement|nutra|vitam[ií]n|aliment/.test(d)) return 'Saúde/Nutra'
  if (/farma|drogar|medic|hospital|cl[ií]nic|odont|estétic|saude|saúde/.test(d)) return 'Saúde'
  if (code.startsWith('47')) return 'Varejo'
  if (code.startsWith('56')) return 'Alimentação'
  if (code.startsWith('85') || code.startsWith('86')) return 'Saúde/Educação'
  if (code.startsWith('62') || code.startsWith('63')) return 'Tecnologia/Serviços'
  return 'Geral'
}

export type CnpjVaultPayload = {
  normalized: CnpjNormalized
  nicheInferred: string
  geofencing: VaultGeofencing
}

/**
 * Valida CNPJ na Brasil API: só prossegue se situação cadastral for ATIVA.
 */
export async function validateCnpjForVault(cnpjRaw: string): Promise<CnpjVaultPayload> {
  const digits = normalizeCnpjDigits(cnpjRaw)
  if (digits.length !== 14) {
    throw new Error('CNPJ inválido (esperado 14 dígitos)')
  }

  const normalized = await fetchCnpjBrasilApiNoStore(digits)
  if (!normalized) {
    throw new Error('CNPJ não encontrado na Brasil API')
  }

  const situacao = (normalized.situacaoCadastral || '').trim()
  if (!situacao || !CNPJ_SITUACAO_ATIVA_RE.test(situacao)) {
    throw new Error(`CNPJ bloqueado: situação cadastral não é ATIVA (${situacao || 'desconhecida'})`)
  }

  const nicheInferred = inferNicheFromCnae(normalized.cnae, normalized.cnaeDescricao)

  const cidade = (normalized.municipio || '').trim()
  const ufRaw = (normalized.uf || '').trim().toUpperCase()
  if (cidade.length < 2) {
    throw new Error('Brasil API sem município — geofencing obrigatório para o cofre (Módulo 02)')
  }
  if (ufRaw.length !== 2) {
    throw new Error('Brasil API sem UF válida — geofencing obrigatório para o cofre (Módulo 02)')
  }

  const geofencing: VaultGeofencing = {
    cidade,
    estado: ufRaw,
    cep: normalized.cep,
  }

  return {
    normalized,
    nicheInferred,
    geofencing,
  }
}
