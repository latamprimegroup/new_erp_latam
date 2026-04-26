/**
 * Banco Inter — Integração API v2 (PIX Cobrança + OAuth2 + mTLS)
 *
 * Docs: https://developers.bancointer.com.br/reference/
 *
 * Autenticação: OAuth2 Client Credentials + mTLS obrigatório
 *
 * Certificados (busca nesta ordem de prioridade):
 *   1. Arquivos: /certs/inter.crt  e  /certs/inter.key
 *   2. Variáveis de ambiente: INTER_CERT_CRT  e  INTER_CERT_KEY (PEM ou base64)
 *
 * Credenciais (env vars):
 *   INTER_CLIENT_ID       — 503c4506-0838-4b6e-95a5-6aaa95493719
 *   INTER_CLIENT_SECRET   — 251f7799-be77-4b00-a2f0-3717274c17b6
 *   INTER_ACCOUNT_NUMBER  — Número da conta corrente
 *   INTER_PIX_KEY         — Chave PIX cadastrada (CNPJ, email, aleatória)
 *   INTER_PIX_WEBHOOK_SECRET — Segredo compartilhado (header x-inter-webhook-secret)
 */

import fs   from 'fs'
import path from 'path'
import { Agent } from 'undici'

const BASE_URL  = 'https://cdpj.partners.bancointer.com.br'
const TOKEN_URL = 'https://cdpj.partners.bancointer.com.br/oauth/v2/token'

// ─── Tipos de erro estruturados ───────────────────────────────────────────────

export class InterApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string,
    public readonly endpoint: string,
  ) {
    super(`Inter API ${endpoint} → ${statusCode}: ${body}`)
    this.name = 'InterApiError'
  }
}

// ─── Cache de token em memória ────────────────────────────────────────────────

let _cachedToken: { token: string; expiresAt: number } | null = null

// ─── Leitura de certificados ──────────────────────────────────────────────────

function firstEnvValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]
    if (value && value.trim()) return value.trim()
  }
  return ''
}

function normalizePem(raw: string, type: 'CERTIFICATE' | 'PRIVATE KEY'): string {
  const trimmed = raw.trim()
  // Já é PEM completo (com ou sem \n escapados)
  if (trimmed.startsWith('-----')) return trimmed.replace(/\\n/g, '\n')
  // Assume base64 puro — reconstrói PEM
  const body  = trimmed.replace(/\s/g, '')
  const lines = body.match(/.{1,64}/g)?.join('\n') ?? body
  return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----`
}

/**
 * Carrega os certificados mTLS.
 * Tenta primeiro /certs/inter.crt|key, depois as env vars.
 */
function loadCerts(): { cert: string; key: string } {
  const certsDir = path.join(process.cwd(), 'certs')

  const crtPath = firstEnvValue('INTER_TLS_CERT_PATH', 'BANCO_INTER_TLS_CERT_PATH') || path.join(certsDir, 'inter.crt')
  const keyPath = firstEnvValue('INTER_TLS_KEY_PATH', 'BANCO_INTER_TLS_KEY_PATH') || path.join(certsDir, 'inter.key')

  let certRaw = ''
  let keyRaw  = ''

  // Tenta carregar do sistema de arquivos
  if (fs.existsSync(crtPath)) {
    certRaw = fs.readFileSync(crtPath, 'utf-8')
    console.log('[Inter] Certificado carregado de certs/inter.crt')
  } else {
    const certEnv = firstEnvValue(
      'INTER_CERT_CRT',
      'INTER_CERT_BASE64',
      'BANCO_INTER_CERT_BASE64',
    )
    if (certEnv) {
      certRaw = certEnv
      console.log('[Inter] Certificado carregado de variável de ambiente')
    }
  }

  if (fs.existsSync(keyPath)) {
    keyRaw = fs.readFileSync(keyPath, 'utf-8')
    console.log('[Inter] Chave privada carregada de certs/inter.key')
  } else {
    const keyEnv = firstEnvValue(
      'INTER_CERT_KEY',
      'INTER_KEY_BASE64',
      'BANCO_INTER_KEY_BASE64',
    )
    if (keyEnv) {
      keyRaw = keyEnv
      console.log('[Inter] Chave privada carregada de variável de ambiente')
    }
  }

  if (!certRaw || !keyRaw) {
    throw new InterApiError(
      0,
      'Certificado mTLS não encontrado. Use inter.crt/inter.key em /certs/ ou variáveis INTER_CERT_* / BANCO_INTER_*',
      'loadCerts',
    )
  }

  return {
    cert: normalizePem(certRaw, 'CERTIFICATE'),
    key:  normalizePem(keyRaw, 'PRIVATE KEY'),
  }
}

/**
 * Cria um Undici Agent com mTLS para comunicação segura com o Banco Inter.
 * Cada chamada re-usa o agent por enquanto (sem cache global para evitar reuso de socket expirado).
 */
function createMtlsAgent(): Agent {
  const { cert, key } = loadCerts()
  return new Agent({
    connect: {
      cert,
      key,
      rejectUnauthorized: true,
    },
  })
}

// ─── OAuth2 Token ─────────────────────────────────────────────────────────────

/**
 * Obtém (ou retorna do cache) o access_token OAuth2 do Inter.
 * Scopes: cob.write cob.read pix.read webhook.read webhook.write
 */
export async function getInterToken(): Promise<string> {
  const now = Date.now()
  if (_cachedToken && _cachedToken.expiresAt > now + 60_000) {
    return _cachedToken.token
  }

  const clientId = firstEnvValue(
    'INTER_CLIENT_ID',
    'BANCO_INTER_CLIENT_ID',
    'BANCO_INTER_APP_CLIENT_ID',
    'BANK_INTER_CLIENT_ID',
  )
  const clientSecret = firstEnvValue(
    'INTER_CLIENT_SECRET',
    'BANCO_INTER_CLIENT_SECRET',
    'BANCO_INTER_APP_CLIENT_SECRET',
    'BANK_INTER_CLIENT_SECRET',
  )

  if (!clientId || !clientSecret) {
    throw new InterApiError(
      0,
      'Client ID/Secret do Inter não configurados (INTER_* ou BANCO_INTER_*)',
      '/oauth/v2/token',
    )
  }

  const body = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         'cob.write cob.read pix.read webhook.read webhook.write',
    grant_type:    'client_credentials',
  })

  const agent = createMtlsAgent()

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
    // undici dispatcher (mTLS)
    // @ts-expect-error — undici dispatcher não está no tipo fetch global do TS
    dispatcher: agent,
  })

  if (!res.ok) {
    const txt = await res.text()
    // Invalida cache corrompido
    _cachedToken = null
    throw new InterApiError(res.status, txt, '/oauth/v2/token')
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  _cachedToken = { token: data.access_token, expiresAt: now + data.expires_in * 1000 }

  console.log(`[Inter] Token OAuth2 obtido — expira em ${data.expires_in}s`)
  return _cachedToken.token
}

// ─── Tipos PIX ────────────────────────────────────────────────────────────────

export type PixDevedor =
  | { nome: string; cpf: string }
  | { nome: string; cnpj: string }

export type PixChargeResponse = {
  txid:          string
  status:        'ATIVA' | 'CONCLUIDA' | 'REMOVIDA_PELO_USUARIO_RECEBEDOR' | 'REMOVIDA_PELO_PSP'
  calendario:    { criacao: string; expiracao: number }
  devedor:       PixDevedor
  valor:         { original: string }
  chave:         string
  pixCopiaECola: string
  location:      string
}

export type PixQrCodeResponse = {
  imagemQrcode: string   // PNG em base64
  qrcode:       string   // igual ao pixCopiaECola
}

export type CreatePixChargeResult = {
  txid:          string
  pixCopyPaste:  string
  qrCodeBase64:  string
  expiresAt:     Date
  location:      string
}

// ─── createImmediateCharge (alias semântico de generatePixCharge) ─────────────

/**
 * Cria uma cobrança PIX dinâmica imediata (COB) no Banco Inter.
 *
 * Nomenclatura adotada no projeto:
 *   createImmediateCharge — público / intenção clara
 *   generatePixCharge     — mantido para retrocompatibilidade
 *
 * Retorna: txid, pixCopyPaste, qrCodeBase64, expiresAt, location
 */
export async function createImmediateCharge(params: {
  txid:          string   // UUID sem hífens — máx 35 chars alfanumérico
  amount:        number   // valor em R$ (ex: 1500.00)
  buyerName:     string
  buyerCpf?:     string   // CPF 11 dígitos (PF) — exclusivo com buyerCnpj
  buyerCnpj?:    string   // CNPJ 14 dígitos (PJ)
  description:   string   // visível ao pagador no aplicativo bancário
  expiracaoSec?: number   // padrão 1800 (30 min)
  extra?:        { nome: string; valor: string }[]  // infoAdicionais
}): Promise<CreatePixChargeResult> {
  const token      = await getInterToken()
  const agent      = createMtlsAgent()
  const chavePix = firstEnvValue(
    'INTER_PIX_KEY',
    'BANCO_INTER_PIX_KEY',
    'BANCO_INTER_CHAVE_PIX',
    'BANK_INTER_PIX_KEY',
  )
  const accountNumber = firstEnvValue(
    'INTER_ACCOUNT_NUMBER',
    'INTER_ACCOUNT_KEY',
    'BANCO_INTER_ACCOUNT_NUMBER',
    'BANCO_INTER_CONTA_CORRENTE',
    'BANK_INTER_ACCOUNT_NUMBER',
  )

  if (!chavePix) throw new InterApiError(0, 'Chave PIX do Inter não configurada', 'createImmediateCharge')
  if (!accountNumber) throw new InterApiError(0, 'Número da conta Inter não configurado', 'createImmediateCharge')

  const expiracao = params.expiracaoSec ?? 1800
  // txid: [a-zA-Z0-9]{26,35} — remove hífens, garante mínimo de 26 e máximo de 35 chars
  const rawTxid   = params.txid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  const txid      = rawTxid.length >= 26
    ? rawTxid.slice(0, 35)
    : rawTxid.padEnd(26, '0').slice(0, 35) // pad com zeros se CUID for curto demais

  const cnpjClean = params.buyerCnpj?.replace(/\D/g, '') ?? ''
  const cpfClean  = params.buyerCpf?.replace(/\D/g, '')  ?? ''
  const devedor: PixDevedor = cnpjClean.length === 14
    ? { nome: params.buyerName, cnpj: cnpjClean }
    : { nome: params.buyerName, cpf: cpfClean }

  const payload = {
    calendario:         { expiracao },
    devedor,
    valor:              { original: params.amount.toFixed(2) },
    chave:              chavePix,
    solicitacaoPagador: params.description.slice(0, 140),
    infoAdicionais: [
      { nome: 'Sistema', valor: 'War Room OS — Ads Ativos' },
      ...(params.extra ?? []),
    ],
  }

  // PUT /pix/v2/cob/{txid}
  const cobRes = await fetch(`${BASE_URL}/pix/v2/cob/${txid}`, {
    method:  'PUT',
    headers: {
      Authorization:   `Bearer ${token}`,
      'Content-Type':  'application/json',
      'x-conta-corrente': accountNumber,
    },
    body:    JSON.stringify(payload),
    // @ts-expect-error — undici dispatcher
    dispatcher: agent,
  })

  if (!cobRes.ok) {
    const txt = await cobRes.text()
    throw new InterApiError(cobRes.status, txt, `PUT /pix/v2/cob/${txid}`)
  }

  const cob = await cobRes.json() as PixChargeResponse
  console.log(`[Inter] Cobrança PIX criada — txid: ${txid} — valor: R$${params.amount.toFixed(2)}`)

  // GET /pix/v2/cob/{txid}/qrcode
  let qrCodeBase64 = ''
  const qrRes = await fetch(`${BASE_URL}/pix/v2/cob/${txid}/qrcode`, {
    headers: {
      Authorization:      `Bearer ${token}`,
      'x-conta-corrente': accountNumber,
    },
    // @ts-expect-error — undici dispatcher
    dispatcher: agent,
  })

  if (qrRes.ok) {
    const qr     = await qrRes.json() as PixQrCodeResponse
    qrCodeBase64 = qr.imagemQrcode
  } else {
    console.warn(`[Inter] QR Code não obtido (${qrRes.status}) — pixCopyPaste ainda válido`)
  }

  return {
    txid:         cob.txid ?? txid,
    pixCopyPaste: cob.pixCopiaECola,
    qrCodeBase64,
    expiresAt:    new Date(Date.now() + expiracao * 1000),
    location:     cob.location ?? '',
  }
}

/** Alias retrocompatível */
export const generatePixCharge = createImmediateCharge

// ─── Consulta de Cobrança ─────────────────────────────────────────────────────

/** Consulta o status de uma cobrança pelo txid */
export async function getPixChargeStatus(txid: string): Promise<PixChargeResponse> {
  const token = await getInterToken()
  const agent = createMtlsAgent()
  const accountNumber = firstEnvValue(
    'INTER_ACCOUNT_NUMBER',
    'INTER_ACCOUNT_KEY',
    'BANCO_INTER_ACCOUNT_NUMBER',
    'BANCO_INTER_CONTA_CORRENTE',
    'BANK_INTER_ACCOUNT_NUMBER',
  )
  if (!accountNumber) throw new InterApiError(0, 'Número da conta Inter não configurado', `GET /pix/v2/cob/${txid}`)

  const res = await fetch(`${BASE_URL}/pix/v2/cob/${txid}`, {
    headers: {
      Authorization:      `Bearer ${token}`,
      'x-conta-corrente': accountNumber,
    },
    // @ts-expect-error
    dispatcher: agent,
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new InterApiError(res.status, txt, `GET /pix/v2/cob/${txid}`)
  }

  return res.json() as Promise<PixChargeResponse>
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

/**
 * Registra a URL de callback para receber notificações de PIX recebido.
 * Chame uma vez durante setup ou quando a URL de produção mudar.
 */
export async function registerInterWebhook(callbackUrl: string): Promise<{ ok: boolean; message: string }> {
  const token    = await getInterToken()
  const agent    = createMtlsAgent()
  const chavePix = firstEnvValue(
    'INTER_PIX_KEY',
    'BANCO_INTER_PIX_KEY',
    'BANCO_INTER_CHAVE_PIX',
    'BANK_INTER_PIX_KEY',
  )
  const accountNumber = firstEnvValue(
    'INTER_ACCOUNT_NUMBER',
    'INTER_ACCOUNT_KEY',
    'BANCO_INTER_ACCOUNT_NUMBER',
    'BANCO_INTER_CONTA_CORRENTE',
    'BANK_INTER_ACCOUNT_NUMBER',
  )

  if (!chavePix) throw new InterApiError(0, 'Chave PIX do Inter não configurada', 'registerWebhook')
  if (!accountNumber) throw new InterApiError(0, 'Número da conta Inter não configurado', 'registerWebhook')

  const res = await fetch(`${BASE_URL}/pix/v2/webhook/${encodeURIComponent(chavePix)}`, {
    method:  'PUT',
    headers: {
      Authorization:      `Bearer ${token}`,
      'Content-Type':     'application/json',
      'x-conta-corrente': accountNumber,
    },
    body: JSON.stringify({ webhookUrl: callbackUrl }),
    // @ts-expect-error
    dispatcher: agent,
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new InterApiError(res.status, txt, 'PUT /pix/v2/webhook')
  }

  console.log(`[Inter] Webhook registrado em: ${callbackUrl}`)
  return { ok: true, message: `Webhook registrado em: ${callbackUrl}` }
}

/**
 * Consulta o webhook cadastrado para a chave PIX.
 */
export async function getRegisteredWebhook(): Promise<{ webhookUrl: string; criacao: string } | null> {
  const token    = await getInterToken()
  const agent    = createMtlsAgent()
  const chavePix = firstEnvValue(
    'INTER_PIX_KEY',
    'BANCO_INTER_PIX_KEY',
    'BANCO_INTER_CHAVE_PIX',
    'BANK_INTER_PIX_KEY',
  )
  const accountNumber = firstEnvValue(
    'INTER_ACCOUNT_NUMBER',
    'INTER_ACCOUNT_KEY',
    'BANCO_INTER_ACCOUNT_NUMBER',
    'BANCO_INTER_CONTA_CORRENTE',
    'BANK_INTER_ACCOUNT_NUMBER',
  )
  if (!chavePix) throw new InterApiError(0, 'Chave PIX do Inter não configurada', 'GET /pix/v2/webhook')
  if (!accountNumber) throw new InterApiError(0, 'Número da conta Inter não configurado', 'GET /pix/v2/webhook')

  const res = await fetch(`${BASE_URL}/pix/v2/webhook/${encodeURIComponent(chavePix)}`, {
    headers: {
      Authorization:      `Bearer ${token}`,
      'x-conta-corrente': accountNumber,
    },
    // @ts-expect-error
    dispatcher: agent,
  })

  if (res.status === 404) return null
  if (!res.ok) {
    const txt = await res.text()
    throw new InterApiError(res.status, txt, 'GET /pix/v2/webhook')
  }

  return res.json() as Promise<{ webhookUrl: string; criacao: string }>
}

// ─── Diagnóstico de Saúde ─────────────────────────────────────────────────────

export type InterHealthReport = {
  timestamp:     string
  tokenOk:       boolean
  certsFound:    boolean
  webhookUrl:    string | null
  lastError:     string | null
  latencyMs:     number
}

/**
 * Verifica a saúde da integração Inter em produção.
 * Usado pelo painel admin do CEO.
 */
export async function checkInterHealth(): Promise<InterHealthReport> {
  const t0        = Date.now()
  const timestamp = new Date().toISOString()
  let tokenOk     = false
  let certsFound  = false
  let webhookUrl: string | null = null
  let lastError:  string | null = null

  try {
    loadCerts()
    certsFound = true
  } catch (e) {
    lastError = (e as Error).message
  }

  if (certsFound) {
    try {
      await getInterToken()
      tokenOk    = true
      const wh   = await getRegisteredWebhook()
      webhookUrl = wh?.webhookUrl ?? null
    } catch (e) {
      lastError = (e as Error).message
    }
  }

  return {
    timestamp,
    tokenOk,
    certsFound,
    webhookUrl,
    lastError,
    latencyMs: Date.now() - t0,
  }
}
