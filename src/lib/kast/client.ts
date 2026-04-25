/**
 * Módulo Cripto — Motor de Pagamento em Stablecoins (USDT / USDC)
 *
 * Engine: NOWPayments (nowpayments.io) — API pública com suporte a USDT/USDC
 * em TRON, ETH, Polygon, Solana e mais 280+ ativos.
 *
 * Nota de arquitetura: o módulo é nomeado "kast" para manter consistência
 * com a terminologia interna da Ads Ativos. Qualquer provider com
 * API de invoice + webhook pode substituir o NOWPayments trocando
 * apenas as funções `createKastInvoice` e `getNowPaymentsBalance`.
 *
 * Env vars necessárias:
 *   NOWPAYMENTS_API_KEY    — Chave gerada em: dashboard.nowpayments.io → API Keys
 *   NOWPAYMENTS_IPN_SECRET — Segredo IPN: Settings → Payments → IPN Secret
 *   NOWPAYMENTS_CURRENCY   — Moeda de recebimento preferencial (padrão: usdttrc20)
 *
 * Docs: https://documenter.getpostman.com/view/7907941/2s93JusNJt
 */

import crypto from 'crypto'
import { getFxRates } from '@/lib/mercury/client'

const NOW_BASE = 'https://api.nowpayments.io/v1'

// ─── Stablecoins suportadas ───────────────────────────────────────────────────

export const SUPPORTED_COINS = {
  usdttrc20: { label: 'USDT (TRC-20 / TRON)', symbol: 'USDT', network: 'TRON',     gasUsd: 0.50  },
  usdterc20: { label: 'USDT (ERC-20 / ETH)',  symbol: 'USDT', network: 'Ethereum', gasUsd: 3.00  },
  usdtbsc:   { label: 'USDT (BEP-20 / BSC)',  symbol: 'USDT', network: 'BSC',      gasUsd: 0.10  },
  usdtpoly:  { label: 'USDT (Polygon)',        symbol: 'USDT', network: 'Polygon',  gasUsd: 0.01  },
  usdcsol:   { label: 'USDC (Solana)',         symbol: 'USDC', network: 'Solana',   gasUsd: 0.002 },
  usdcerc20: { label: 'USDC (ERC-20 / ETH)',  symbol: 'USDC', network: 'Ethereum', gasUsd: 3.00  },
} as const

export type SupportedCoin = keyof typeof SUPPORTED_COINS

// ─── Erro estruturado ─────────────────────────────────────────────────────────

export class KastApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string,
    public readonly endpoint: string,
  ) {
    super(`Kast/NowPay ${endpoint} → ${statusCode}: ${body}`)
    this.name = 'KastApiError'
  }
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type KastQuote = {
  priceCurrency:   string  // "brl" | "usd"
  priceAmount:     number
  payCurrency:     SupportedCoin
  payAmount:       number  // quantidade de cripto a pagar
  networkFeeUsd:   number
  netAmountUsd:    number  // payAmount em USD menos gas
  expiresAt:       string  // ISO timestamp
}

export type KastInvoice = {
  invoiceId:    string
  paymentId:    string
  invoiceUrl:   string  // URL para redirecionar o cliente
  payAddress:   string
  payCurrency:  SupportedCoin
  payAmount:    number
  priceAmount:  number
  priceCurrency: string
  status:       KastPaymentStatus
  createdAt:    string
  expiresAt:    string | null
  orderId:      string  // seu ID interno
}

export type KastPaymentStatus =
  | 'waiting'       // aguardando pagamento
  | 'confirming'    // tx detectada, aguardando confirmações
  | 'confirmed'     // confirmações suficientes
  | 'sending'       // enviando para carteira do merchant
  | 'partially_paid' // pagamento parcial recebido
  | 'finished'      // ✅ PAGO — usar este para marcar venda
  | 'failed'
  | 'refunded'
  | 'expired'

// ─── Auth ─────────────────────────────────────────────────────────────────────

function apiKey(): string {
  const k = process.env.NOWPAYMENTS_API_KEY
  if (!k) throw new KastApiError(0, 'NOWPAYMENTS_API_KEY não configurada', 'auth')
  return k
}

function defaultCoin(): SupportedCoin {
  const c = process.env.NOWPAYMENTS_CURRENCY ?? 'usdttrc20'
  return (c in SUPPORTED_COINS ? c : 'usdttrc20') as SupportedCoin
}

// ─── Requisição genérica ──────────────────────────────────────────────────────

async function nowFetch<T>(
  endpoint: string,
  options?: RequestInit & { body?: unknown },
): Promise<T> {
  const url = `${NOW_BASE}${endpoint}`
  const init: RequestInit = {
    ...options,
    headers: {
      'x-api-key':    apiKey(),
      'Content-Type': 'application/json',
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  }
  const res  = await fetch(url, init)
  const text = await res.text()
  if (!res.ok) throw new KastApiError(res.status, text, endpoint)
  return JSON.parse(text) as T
}

// ─── Quote — Cotação de preço ─────────────────────────────────────────────────

/**
 * Converte um valor (BRL ou USD) para a quantidade exata de cripto.
 *
 * getKastQuote({ priceAmount: 500, priceCurrency: 'brl', coin: 'usdttrc20' })
 * → { payAmount: 96.15, networkFeeUsd: 0.5, netAmountUsd: 95.65 }
 */
export async function getKastQuote(opts: {
  priceAmount:   number
  priceCurrency: 'brl' | 'usd'
  coin?:         SupportedCoin
}): Promise<KastQuote> {
  const coin = opts.coin ?? defaultCoin()
  const coinInfo = SUPPORTED_COINS[coin]

  // Normaliza para USD
  let amountUsd = opts.priceAmount
  if (opts.priceCurrency === 'brl') {
    const fx = await getFxRates()
    const brlRate = fx.rates['BRL'] ?? 5.20
    amountUsd = opts.priceAmount / brlRate
  }

  // Obtém cotação da NOWPayments
  const data = await nowFetch<{ estimated_amount: number; rate_id?: string }>(
    `/estimate?amount=${amountUsd}&currency_from=usd&currency_to=${coin}`,
  )

  const payAmount    = Number(data.estimated_amount)
  const networkFeeUsd = coinInfo.gasUsd
  const netAmountUsd  = Math.max(0, amountUsd - networkFeeUsd)

  return {
    priceCurrency:  opts.priceCurrency,
    priceAmount:    opts.priceAmount,
    payCurrency:    coin,
    payAmount,
    networkFeeUsd,
    netAmountUsd,
    expiresAt:      new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min
  }
}

// ─── Criar Invoice ────────────────────────────────────────────────────────────

/**
 * Cria uma invoice de pagamento cripto.
 * Retorna URL de pagamento para redirecionar o cliente.
 */
export async function createKastInvoice(opts: {
  orderId:         string
  priceAmount:     number
  priceCurrency:   'brl' | 'usd'
  payCurrency?:    SupportedCoin
  description?:    string
  successUrl?:     string
  cancelUrl?:      string
  ipnCallbackUrl?: string
}): Promise<KastInvoice> {
  const coin        = opts.payCurrency ?? defaultCoin()
  const callbackUrl = opts.ipnCallbackUrl
    ?? `${process.env.NEXTAUTH_URL ?? ''}/api/webhooks/kast`

  // NOWPayments trabalha com USD como moeda base quando priceCurrency != 'usd'
  let normalizedAmount = opts.priceAmount
  let normalizedCurrency = opts.priceCurrency

  if (opts.priceCurrency === 'brl') {
    const fx = await getFxRates()
    const brlRate = fx.rates['BRL'] ?? 5.20
    normalizedAmount   = Math.round((opts.priceAmount / brlRate) * 100) / 100
    normalizedCurrency = 'usd'
  }

  const payload = {
    price_amount:      normalizedAmount,
    price_currency:    normalizedCurrency,
    pay_currency:      coin,
    order_id:          opts.orderId,
    order_description: opts.description ?? 'Ads Ativos Global — Pagamento Cripto',
    ipn_callback_url:  callbackUrl,
    success_url:       opts.successUrl,
    cancel_url:        opts.cancelUrl,
    is_fixed_rate:     true,        // taxa travada por 15 min
    is_fee_paid_by_user: false,     // taxa de rede por conta do merchant
  }

  const res = await nowFetch<{
    id:            string
    token_id?:     string
    invoice_url:   string
    pay_address?:  string
    pay_amount?:   number
    pay_currency:  string
    price_amount:  number
    price_currency: string
    payment_status: string
    created_at:    string
    expiration_estimate_date?: string
    payment_id?:   string
  }>('/invoice', { method: 'POST', body: payload })

  return {
    invoiceId:     res.id,
    paymentId:     res.payment_id ?? res.id,
    invoiceUrl:    res.invoice_url,
    payAddress:    res.pay_address ?? '',
    payCurrency:   coin,
    payAmount:     Number(res.pay_amount ?? 0),
    priceAmount:   Number(res.price_amount),
    priceCurrency: res.price_currency,
    status:        (res.payment_status ?? 'waiting') as KastPaymentStatus,
    createdAt:     res.created_at,
    expiresAt:     res.expiration_estimate_date ?? null,
    orderId:       opts.orderId,
  }
}

// ─── Consultar status de pagamento ────────────────────────────────────────────

export async function getKastPaymentStatus(paymentId: string): Promise<{
  paymentId: string
  status:    KastPaymentStatus
  payAmount: number
  actuallyPaid: number
  payCurrency:  string
  orderId:      string
}> {
  const res = await nowFetch<{
    payment_id:    string | number
    payment_status: string
    pay_amount:    number
    actually_paid: number
    pay_currency:  string
    order_id:      string
  }>(`/payment/${paymentId}`)

  return {
    paymentId:    String(res.payment_id),
    status:       res.payment_status as KastPaymentStatus,
    payAmount:    Number(res.pay_amount),
    actuallyPaid: Number(res.actually_paid),
    payCurrency:  res.pay_currency,
    orderId:      res.order_id,
  }
}

// ─── Verificação de Webhook IPN ───────────────────────────────────────────────

/**
 * Verifica assinatura HMAC-SHA512 do IPN da NOWPayments.
 *
 * Header: x-nowpayments-sig
 * Algoritmo: HMAC-SHA512(sorted_json_payload, IPN_SECRET)
 */
export function verifyKastWebhook(
  body: Record<string, unknown>,
  signatureHeader: string,
  ipnSecret: string,
): boolean {
  // Ordena as chaves do payload alfabeticamente (requisito NOWPayments)
  const sorted = JSON.stringify(body, Object.keys(body).sort())
  const expected = crypto
    .createHmac('sha512', ipnSecret)
    .update(sorted)
    .digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signatureHeader, 'hex'),
  )
}

// ─── Saldo cripto (NOWPayments Balance) ───────────────────────────────────────

export type CryptoBalance = {
  currency: string
  amount:   number
  pending:  number
}

/**
 * Retorna o saldo de cada moeda na conta NOWPayments.
 * (Saldo que ainda não foi retirado para carteira própria)
 */
export async function getKastBalances(): Promise<CryptoBalance[]> {
  const res = await nowFetch<{ currencies: Record<string, { amount: number; pending_amount?: number }> }>(
    '/balance',
  )

  return Object.entries(res.currencies ?? {})
    .filter(([, v]) => v.amount > 0 || (v.pending_amount ?? 0) > 0)
    .map(([currency, v]) => ({
      currency,
      amount:  v.amount,
      pending: v.pending_amount ?? 0,
    }))
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkKastHealth(): Promise<{
  ok:      boolean
  status?: string
  error?:  string
}> {
  try {
    const res = await nowFetch<{ message: string }>('/status')
    return { ok: true, status: res.message }
  } catch (e) {
    return { ok: false, error: e instanceof KastApiError ? e.message : String(e) }
  }
}

// ─── Cálculo de Lucro Líquido Cripto ─────────────────────────────────────────

/**
 * Dado um pagamento recebido em cripto:
 *  - Subtrai a taxa de rede (gas) estimada
 *  - Converte para BRL e USD usando FX live
 * Retorna breakdown completo para registro em Transaction.
 */
export async function calcCryptoNetProfit(opts: {
  coin:          SupportedCoin
  receivedAmount: number  // quantidade de cripto recebida
  usdPricePerUnit?: number // se já tiver a cotação atual
}): Promise<{
  grossUsd:     number
  gasFeeUsd:    number
  netUsd:       number
  netBrl:       number
  fxRateBrl:    number
  marginPct:    number
}> {
  const fx = await getFxRates()
  const brlRate = fx.rates['BRL'] ?? 5.20

  // USDT/USDC são 1:1 com USD por definição
  const isStable = opts.coin.startsWith('usdt') || opts.coin.startsWith('usdc')
  const usdPrice = isStable ? 1.0 : (opts.usdPricePerUnit ?? 1.0)

  const grossUsd  = opts.receivedAmount * usdPrice
  const gasFeeUsd = SUPPORTED_COINS[opts.coin].gasUsd
  const netUsd    = Math.max(0, grossUsd - gasFeeUsd)
  const netBrl    = netUsd * brlRate
  const marginPct = grossUsd > 0 ? (netUsd / grossUsd) * 100 : 0

  return {
    grossUsd:  Math.round(grossUsd  * 10000) / 10000,
    gasFeeUsd: Math.round(gasFeeUsd * 10000) / 10000,
    netUsd:    Math.round(netUsd    * 10000) / 10000,
    netBrl:    Math.round(netBrl    * 100)   / 100,
    fxRateBrl: brlRate,
    marginPct: Math.round(marginPct * 100) / 100,
  }
}
