/**
 * Banco Inter — Integração API v2 (PIX Cobrança)
 *
 * Autenticação: OAuth2 + mTLS (certificado .crt + .key)
 * Docs: https://developers.bancointer.com.br/reference/
 *
 * Variáveis de ambiente necessárias:
 *   INTER_CLIENT_ID       — Client ID do app Inter
 *   INTER_CLIENT_SECRET   — Client Secret do app Inter
 *   INTER_CERT_CRT        — Conteúdo do arquivo .crt (PEM, base64 ou multiline)
 *   INTER_CERT_KEY        — Conteúdo do arquivo .key (PEM, base64 ou multiline)
 *   INTER_ACCOUNT_NUMBER  — Número da conta corrente (para webhooks)
 *   INTER_PIX_KEY         — Chave PIX cadastrada (CPF, CNPJ, email, aleatória)
 */

import https from 'https'

const BASE_URL  = 'https://cdpj.partners.bancointer.com.br'
const TOKEN_URL = 'https://cdpj.partners.bancointer.com.br/oauth/v2/token'

// ─── Cache de token em memória ────────────────────────────────────────────────
let _cachedToken: { token: string; expiresAt: number } | null = null

// ─── Utilitários ──────────────────────────────────────────────────────────────

function decodePem(raw: string): string {
  // Suporta base64 puro (sem headers PEM) ou PEM completo com \n ou \\n
  const trimmed = raw.trim()
  if (trimmed.startsWith('-----')) {
    return trimmed.replace(/\\n/g, '\n')
  }
  // Assume base64 puro — reconstrói PEM
  const body = trimmed.replace(/\s/g, '')
  const lines = body.match(/.{1,64}/g)?.join('\n') ?? body
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`
}

function decodeKeyPem(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('-----')) {
    return trimmed.replace(/\\n/g, '\n')
  }
  const body = trimmed.replace(/\s/g, '')
  const lines = body.match(/.{1,64}/g)?.join('\n') ?? body
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`
}

/** Cria agente HTTPS com mTLS (certificado + chave cliente) */
function createMtlsAgent(): https.Agent {
  const cert = decodePem(process.env.INTER_CERT_CRT ?? '')
  const key  = decodeKeyPem(process.env.INTER_CERT_KEY ?? '')
  return new https.Agent({ cert, key, rejectUnauthorized: true })
}

// ─── OAuth2 Token ─────────────────────────────────────────────────────────────

/**
 * Obtém (ou retorna do cache) o access_token OAuth2 do Inter.
 * Scope: cob.write cob.read pix.read
 */
export async function getInterToken(): Promise<string> {
  const now = Date.now()
  if (_cachedToken && _cachedToken.expiresAt > now + 30_000) {
    return _cachedToken.token
  }

  const clientId     = process.env.INTER_CLIENT_ID ?? ''
  const clientSecret = process.env.INTER_CLIENT_SECRET ?? ''

  if (!clientId || !clientSecret) {
    throw new Error('INTER_CLIENT_ID ou INTER_CLIENT_SECRET não configurados')
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
    // @ts-expect-error — Node.js fetch aceita agent via dispatcher ou undici
    agent,
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Inter OAuth2 falhou (${res.status}): ${txt}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  _cachedToken = { token: data.access_token, expiresAt: now + data.expires_in * 1000 }
  return _cachedToken.token
}

// ─── Tipos PIX ────────────────────────────────────────────────────────────────

export type PixCalendario = {
  expiracao: number  // segundos — padrão 1800 (30 min)
}

export type PixDevedor = {
  nome: string
  cpf:  string        // apenas dígitos
}

export type PixValor = {
  original: string    // "150.00"
}

export type PixChargeRequest = {
  calendario:  PixCalendario
  devedor:     PixDevedor
  valor:       PixValor
  chave:       string          // chave PIX do recebedor
  solicitacaoPagador: string   // descrição visível ao pagador
  infoAdicionais?: { nome: string; valor: string }[]
}

export type PixChargeResponse = {
  txid:         string
  status:       'ATIVA' | 'CONCLUIDA' | 'REMOVIDA_PELO_USUARIO_RECEBEDOR' | 'REMOVIDA_PELO_PSP'
  calendario:   { criacao: string; expiracao: number }
  devedor:      PixDevedor
  valor:        PixValor
  chave:        string
  pixCopiaECola: string
  location:     string
}

export type PixQrCodeResponse = {
  imagemQrcode:  string  // base64 PNG
  qrcode:        string  // copia-e-cola (igual ao pixCopiaECola)
}

// ─── Funções PIX ─────────────────────────────────────────────────────────────

/**
 * Gera uma cobrança PIX dinâmica (cob) no Banco Inter.
 * Retorna o txid, pix copia-e-cola e QR code em base64.
 */
export async function generatePixCharge(params: {
  txid:        string   // UUID sem hífens — máx 35 chars
  amount:      number   // valor em R$ (ex: 150.00)
  buyerName:   string
  buyerCpf:    string   // apenas dígitos
  description: string
  expiracaoSec?: number // padrão: 1800 (30 min)
}): Promise<{ txid: string; pixCopyPaste: string; qrCodeBase64: string; expiresAt: Date }> {
  const token = await getInterToken()
  const agent = createMtlsAgent()
  const chave = process.env.INTER_PIX_KEY ?? ''

  if (!chave) throw new Error('INTER_PIX_KEY não configurada')

  const expiracao = params.expiracaoSec ?? 1800
  const txid      = params.txid.replace(/-/g, '').slice(0, 35)

  const payload: PixChargeRequest = {
    calendario:          { expiracao },
    devedor:             { nome: params.buyerName, cpf: params.buyerCpf.replace(/\D/g, '') },
    valor:               { original: params.amount.toFixed(2) },
    chave,
    solicitacaoPagador:  params.description,
    infoAdicionais: [
      { nome: 'Sistema', valor: 'Ads Ativos War Room' },
    ],
  }

  // PUT /pix/v2/cob/{txid}
  const cobRes = await fetch(`${BASE_URL}/pix/v2/cob/${txid}`, {
    method:  'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    // @ts-expect-error
    agent,
  })

  if (!cobRes.ok) {
    const txt = await cobRes.text()
    throw new Error(`Inter PUT /cob falhou (${cobRes.status}): ${txt}`)
  }

  const cob = await cobRes.json() as PixChargeResponse

  // GET /pix/v2/cob/{txid}/qrcode
  const qrRes = await fetch(`${BASE_URL}/pix/v2/cob/${txid}/qrcode`, {
    headers: { Authorization: `Bearer ${token}` },
    // @ts-expect-error
    agent,
  })

  let qrCodeBase64 = ''
  if (qrRes.ok) {
    const qr = await qrRes.json() as PixQrCodeResponse
    qrCodeBase64 = qr.imagemQrcode
  }

  const expiresAt = new Date(Date.now() + expiracao * 1000)

  return {
    txid:          cob.txid ?? txid,
    pixCopyPaste:  cob.pixCopiaECola,
    qrCodeBase64,
    expiresAt,
  }
}

/**
 * Consulta o status de uma cobrança PIX pelo txid.
 */
export async function getPixChargeStatus(txid: string): Promise<PixChargeResponse> {
  const token = await getInterToken()
  const agent = createMtlsAgent()

  const res = await fetch(`${BASE_URL}/pix/v2/cob/${txid}`, {
    headers: { Authorization: `Bearer ${token}` },
    // @ts-expect-error
    agent,
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Inter GET /cob/${txid} falhou (${res.status}): ${txt}`)
  }

  return res.json() as Promise<PixChargeResponse>
}

/**
 * Registra o webhook do Inter para receber confirmações de PIX recebido.
 * Chame uma vez na configuração da conta.
 */
export async function registerInterWebhook(callbackUrl: string): Promise<void> {
  const token   = await getInterToken()
  const agent   = createMtlsAgent()
  const chavePix = process.env.INTER_PIX_KEY ?? ''

  const res = await fetch(`${BASE_URL}/pix/v2/webhook/${encodeURIComponent(chavePix)}`, {
    method:  'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ webhookUrl: callbackUrl }),
    // @ts-expect-error
    agent,
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Inter PUT /webhook falhou (${res.status}): ${txt}`)
  }
}
