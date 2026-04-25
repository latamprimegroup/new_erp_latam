/**
 * Mercury Bank — API Client
 *
 * Docs: https://docs.mercury.com/reference
 *
 * Autenticação: Bearer token (MERCURY_API_KEY)
 *   — Gerar em: Mercury Dashboard → Settings → API Tokens
 *   — Read-Only para monitoring; Read-Write para pagamentos futuros
 *
 * Env vars necessárias:
 *   MERCURY_API_KEY          — Token gerado no dashboard Mercury
 *   MERCURY_ACCOUNT_ID       — ID da conta principal (checking)
 *   MERCURY_WEBHOOK_SECRET   — secretKey configurado no endpoint de webhook
 */

import crypto from 'crypto'

const MERCURY_BASE = 'https://api.mercury.com/api/v1'
const FX_API_URL   = 'https://open.er-api.com/v6/latest/USD'

// ─── Erro estruturado ─────────────────────────────────────────────────────────

export class MercuryApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string,
    public readonly endpoint: string,
  ) {
    super(`Mercury API ${endpoint} → ${statusCode}: ${body}`)
    this.name = 'MercuryApiError'
  }
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type MercuryAccount = {
  id:             string
  name:           string
  type:           'checking' | 'savings' | 'treasury' | 'credit' | 'investment'
  status:         'active' | 'suspended' | 'closed'
  currentBalance: number
  availableBalance: number
  routingNumber:  string
  accountNumber:  string
  createdAt:      string
  legalBusinessName: string
}

export type MercuryTransaction = {
  id:              string
  accountId:       string
  amount:          number   // positivo = crédito, negativo = débito
  currency:        string
  status:          'pending' | 'sent' | 'failed'
  createdAt:       string
  postedAt:        string | null
  kind:            string   // achCredit | wireCredit | checkDeposit | etc.
  bankDescription: string | null
  externalMemo:    string | null
  note:            string | null
  counterpartyName: string | null
}

export type FxRates = {
  base:       string
  rates:      Record<string, number>
  updatedAt:  string
}

// ─── Cache de FX (30 minutos) ─────────────────────────────────────────────────

let _fxCache: { rates: FxRates; fetchedAt: number } | null = null
const FX_TTL_MS = 30 * 60 * 1000

// ─── Autenticação ─────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.MERCURY_API_KEY
  if (!key) throw new MercuryApiError(0, 'MERCURY_API_KEY não configurada', 'auth')
  return key
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

// ─── Requisição genérica ──────────────────────────────────────────────────────

async function mercuryFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${MERCURY_BASE}${endpoint}`
  const res = await fetch(url, { ...options, headers: authHeaders() })
  const text = await res.text()
  if (!res.ok) throw new MercuryApiError(res.status, text, endpoint)
  return JSON.parse(text) as T
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

/**
 * Lista todas as contas Mercury da organização.
 */
export async function getMercuryAccounts(): Promise<MercuryAccount[]> {
  const data = await mercuryFetch<{ accounts: MercuryAccount[] }>('/accounts')
  return data.accounts ?? []
}

/**
 * Retorna detalhes de uma conta específica (incluindo saldo atual).
 */
export async function getMercuryAccount(accountId: string): Promise<MercuryAccount> {
  return mercuryFetch<MercuryAccount>(`/account/${accountId}`)
}

/**
 * Saldo consolidado de todas as contas (em USD).
 */
export async function getMercuryBalance(): Promise<{
  totalAvailableUsd: number
  totalCurrentUsd:   number
  accounts: Pick<MercuryAccount, 'id' | 'name' | 'type' | 'availableBalance' | 'currentBalance'>[]
}> {
  const accounts = await getMercuryAccounts()
  const totalAvailableUsd = accounts.reduce((s, a) => s + (a.availableBalance ?? 0), 0)
  const totalCurrentUsd   = accounts.reduce((s, a) => s + (a.currentBalance ?? 0), 0)
  return {
    totalAvailableUsd,
    totalCurrentUsd,
    accounts: accounts.map((a) => ({
      id:              a.id,
      name:            a.name,
      type:            a.type,
      availableBalance: a.availableBalance,
      currentBalance:  a.currentBalance,
    })),
  }
}

// ─── Transactions ─────────────────────────────────────────────────────────────

/**
 * Busca transações de uma conta com filtros opcionais.
 */
export async function getMercuryTransactions(
  accountId: string,
  opts?: {
    limit?: number
    status?: 'pending' | 'sent' | 'failed'
    start?: string // ISO date
    end?:   string
  },
): Promise<MercuryTransaction[]> {
  const params = new URLSearchParams()
  if (opts?.limit)  params.set('limit', String(opts.limit))
  if (opts?.status) params.set('status', opts.status)
  if (opts?.start)  params.set('start', opts.start)
  if (opts?.end)    params.set('end', opts.end)

  const qs = params.toString() ? `?${params.toString()}` : ''
  const data = await mercuryFetch<{ transactions: MercuryTransaction[] }>(
    `/account/${accountId}/transactions${qs}`,
  )
  return data.transactions ?? []
}

/**
 * Últimas N transações da conta principal (enviadas/recebidas).
 */
export async function getRecentMercuryTransactions(limit = 20): Promise<MercuryTransaction[]> {
  const accountId = process.env.MERCURY_ACCOUNT_ID
  if (!accountId) return []
  return getMercuryTransactions(accountId, { limit, status: 'sent' })
}

// ─── FX — Câmbio em tempo real ────────────────────────────────────────────────

/**
 * Retorna taxas de câmbio USD→X (cache de 30 minutos).
 * Fonte: open.er-api.com (grátis, sem chave de API).
 */
export async function getFxRates(): Promise<FxRates> {
  if (_fxCache && Date.now() - _fxCache.fetchedAt < FX_TTL_MS) {
    return _fxCache.rates
  }

  try {
    const res  = await fetch(FX_API_URL)
    const data = await res.json() as { base_code: string; rates: Record<string, number>; time_last_update_utc: string }
    const rates: FxRates = {
      base:      data.base_code,
      rates:     data.rates,
      updatedAt: data.time_last_update_utc,
    }
    _fxCache = { rates, fetchedAt: Date.now() }
    return rates
  } catch {
    // Fallback: câmbio fixo conservador
    return { base: 'USD', rates: { BRL: 5.20, EUR: 0.92, GBP: 0.79 }, updatedAt: 'fallback' }
  }
}

/**
 * Converte USD → BRL usando taxa de câmbio live.
 */
export async function usdToBrl(amountUsd: number): Promise<{ brl: number; rate: number }> {
  const fx = await getFxRates()
  const rate = fx.rates['BRL'] ?? 5.20
  return { brl: Math.round(amountUsd * rate * 100) / 100, rate }
}

// ─── Verificação de Webhook ───────────────────────────────────────────────────

/**
 * Verifica a assinatura HMAC-SHA256 do webhook Mercury.
 *
 * Header: Mercury-Signature: t=<timestamp>,v1=<hex_signature>
 * Signed payload: "<timestamp>.<raw_body>"
 *
 * Rejeita eventos com timestamp > 5 minutos no passado (anti-replay).
 */
export function verifyMercuryWebhook(
  rawBody: string,
  signatureHeader: string,
  secretKey: string,
): { valid: boolean; reason?: string } {
  const parts     = signatureHeader.split(',')
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2)
  const signature = parts.find((p) => p.startsWith('v1='))?.slice(3)

  if (!timestamp || !signature) {
    return { valid: false, reason: 'Header Mercury-Signature mal formado' }
  }

  // Anti-replay: rejeita eventos > 5 minutos
  const tsDiff = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (tsDiff > 300) {
    return { valid: false, reason: `Timestamp expirado: ${Math.round(tsDiff)}s` }
  }

  const signedPayload = `${timestamp}.${rawBody}`
  const expected = crypto
    .createHmac('sha256', secretKey)
    .update(signedPayload)
    .digest('hex')

  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expected, 'hex')

  if (sigBuf.length !== expBuf.length) {
    return { valid: false, reason: 'Tamanho de assinatura inválido' }
  }

  const valid = crypto.timingSafeEqual(sigBuf, expBuf)
  return valid ? { valid: true } : { valid: false, reason: 'Assinatura inválida' }
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkMercuryHealth(): Promise<{
  ok:      boolean
  accounts: number
  totalUsd: number
  error?:  string
}> {
  try {
    const { totalAvailableUsd, accounts } = await getMercuryBalance()
    return { ok: true, accounts: accounts.length, totalUsd: totalAvailableUsd }
  } catch (e) {
    const err = e instanceof MercuryApiError ? e.message : String(e)
    return { ok: false, accounts: 0, totalUsd: 0, error: err }
  }
}
