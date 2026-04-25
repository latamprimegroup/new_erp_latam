/**
 * Pagsmile — Cliente de Integração Server-to-Server
 *
 * Documentação: https://docs.pagsmile.com
 *
 * Suporte a:
 *   ✅ Cobrança única via cartão (token salvo — PCI compliant)
 *   ✅ Tokenização de cartão para recorrência (1-click buy)
 *   ✅ Webhook de confirmação e falha
 *   ✅ Multi-moeda: BRL / USD
 *
 * Variáveis de ambiente necessárias (configure após receber as chaves):
 *   PAGSMILE_APP_ID      — App ID fornecido pela Pagsmile
 *   PAGSMILE_SECRET_KEY  — Secret Key para autenticação HMAC
 *   PAGSMILE_MERCHANT_ID — Merchant ID da conta
 *   PAGSMILE_ENV         — "sandbox" | "production" (default: sandbox)
 */

import crypto from 'crypto'

const ENV        = process.env.PAGSMILE_ENV ?? 'sandbox'
const BASE_URL   = ENV === 'production'
  ? 'https://api.pagsmile.com'
  : 'https://sandbox.pagsmile.com'

const APP_ID      = process.env.PAGSMILE_APP_ID      ?? ''
const SECRET_KEY  = process.env.PAGSMILE_SECRET_KEY  ?? ''
const MERCHANT_ID = process.env.PAGSMILE_MERCHANT_ID ?? ''

// ─── Assinatura HMAC ──────────────────────────────────────────────────────────

function buildSignature(params: Record<string, string>): string {
  // Pagsmile: sort params alphabetically, concatenate key=value&..., append &key=SECRET
  const sorted = Object.keys(params).sort()
  const query  = sorted.map((k) => `${k}=${params[k]}`).join('&')
  const toSign = `${query}&key=${SECRET_KEY}`
  return crypto.createHash('md5').update(toSign).digest('hex').toUpperCase()
}

function baseParams(extra: Record<string, string> = {}): Record<string, string> {
  return {
    app_id:      APP_ID,
    merchant_id: MERCHANT_ID,
    timestamp:   String(Math.floor(Date.now() / 1000)),
    nonce_str:   crypto.randomBytes(8).toString('hex'),
    ...extra,
  }
}

async function pagsmilePost<T = unknown>(
  path: string,
  data: Record<string, string>,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  if (!APP_ID || !SECRET_KEY) {
    console.warn('[Pagsmile] Chaves não configuradas — configure PAGSMILE_APP_ID e PAGSMILE_SECRET_KEY')
    return { ok: false, error: 'Pagsmile não configurado' }
  }

  const params    = baseParams(data)
  params.sign     = buildSignature(params)
  params.sign_type = 'MD5'

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(params),
    })
    const json = await res.json() as Record<string, unknown>

    if (json.code === '10000' || json.return_code === 'SUCCESS') {
      return { ok: true, data: json as T }
    }

    const errMsg = (json.msg ?? json.return_msg ?? json.sub_msg ?? JSON.stringify(json)) as string
    console.error('[Pagsmile] Erro:', errMsg)
    return { ok: false, error: errMsg }
  } catch (err) {
    console.error('[Pagsmile] Falha de rede:', err)
    return { ok: false, error: String(err) }
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PagsmileChargeParams = {
  /** ID da cobrança no nosso sistema (subscriptionId-YYYYMM) */
  outTradeNo:     string
  /** Valor em centavos */
  amountCents:    number
  currency:       'BRL' | 'USD'
  /** Token do cartão salvo (obtido no primeiro pagamento) */
  cardToken:      string
  /** Nome do titular como aparece no cartão */
  cardHolder:     string
  /** Descrição do produto */
  description:    string
  /** E-mail do cliente */
  customerEmail:  string
  /** CPF/CNPJ apenas dígitos */
  customerDocument: string
  /** IP do cliente (obrigatório pela Pagsmile para antifraude) */
  customerIp?:    string
}

export type PagsmileTokenizeResult = {
  cardToken:   string
  cardBrand:   string
  cardLastFour: string
  expiryMonth: string
  expiryYear:  string
}

export type PagsmileChargeResult = {
  tradeNo:     string  // ID interno Pagsmile
  outTradeNo:  string  // Nosso ID
  status:      'SUCCESS' | 'PENDING' | 'FAILED'
  amount:      number
  currency:    string
}

// ─── Cobrança via cartão tokenizado ──────────────────────────────────────────

/**
 * Cobra um cartão previamente tokenizado (recorrência 1-click).
 * Retorna { ok, tradeNo } em caso de sucesso.
 */
export async function chargeCardToken(
  params: PagsmileChargeParams,
): Promise<{ ok: boolean; tradeNo?: string; error?: string }> {
  const result = await pagsmilePost<Record<string, unknown>>('/payin/charge/token', {
    out_trade_no:      params.outTradeNo,
    amount:            (params.amountCents / 100).toFixed(2),
    currency:          params.currency,
    token:             params.cardToken,
    subject:           params.description,
    customer_email:    params.customerEmail,
    customer_id:       params.customerDocument,
    customer_identity: params.customerDocument,
    customer_ip:       params.customerIp ?? '127.0.0.1',
    notify_url:        `${process.env.NEXTAUTH_URL ?? ''}/api/webhooks/pagsmile`,
  })

  if (!result.ok) return { ok: false, error: result.error }
  return {
    ok:      true,
    tradeNo: result.data?.trade_no as string | undefined,
  }
}

// ─── Verificar assinatura de webhook ─────────────────────────────────────────

/**
 * Valida a assinatura do webhook recebido da Pagsmile.
 * @param body - Objeto JSON do webhook
 * @returns true se a assinatura for válida
 */
export function verifyPagsmileWebhook(body: Record<string, unknown>): boolean {
  if (!SECRET_KEY) return true // Sem chave configurada = aceita tudo (modo dev)

  const receivedSign = body.sign as string | undefined
  if (!receivedSign) return false

  const params: Record<string, string> = {}
  for (const [k, v] of Object.entries(body)) {
    if (k !== 'sign' && k !== 'sign_type' && v != null) {
      params[k] = String(v)
    }
  }

  const expectedSign = buildSignature(params)
  return receivedSign === expectedSign
}

// ─── Consultar status de transação ───────────────────────────────────────────

export async function queryTransaction(
  outTradeNo: string,
): Promise<{ ok: boolean; status?: string; tradeNo?: string }> {
  const result = await pagsmilePost<Record<string, unknown>>('/payin/query', {
    out_trade_no: outTradeNo,
  })

  if (!result.ok) return { ok: false }
  return {
    ok:      true,
    status:  result.data?.trade_status as string | undefined,
    tradeNo: result.data?.trade_no as string | undefined,
  }
}

// ─── Informações de configuração ─────────────────────────────────────────────

export function isPagsmileConfigured(): boolean {
  return Boolean(APP_ID && SECRET_KEY && MERCHANT_ID)
}

export function getPagsmileEnv(): string {
  return ENV
}
