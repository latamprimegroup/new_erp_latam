/**
 * Consulta de saldo (conta garantia / operacional) via API Banking Inter.
 * Requer credenciais no Internet Banking PJ; em produção costuma exigir certificado TLS (mTLS).
 * URLs e path de saldo podem variar por ambiente — ajuste via env.
 */

import https from 'https'
import fs from 'fs'

export type InterSaldoResult =
  | { ok: true; balanceBrl: number; raw: unknown }
  | { ok: false; code: 'NOT_CONFIGURED' | 'TOKEN_FAILED' | 'SALDO_FAILED' | 'PARSE_ERROR' | 'TLS_ERROR'; detail?: string }

function readTlsAgent(): https.Agent | undefined {
  const certPath = process.env.BANCO_INTER_TLS_CERT_PATH?.trim()
  const keyPath = process.env.BANCO_INTER_TLS_KEY_PATH?.trim()
  if (!certPath || !keyPath) return undefined
  try {
    return new https.Agent({
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    })
  } catch (e) {
    throw new Error(`BANCO_INTER_TLS: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function httpsRequestJson(opts: {
  method: string
  href: string
  headers: Record<string, string>
  body?: string
  agent?: https.Agent
}): Promise<{ status: number; json: unknown | null; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(opts.href)
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: opts.method,
        headers: opts.headers,
        agent: opts.agent,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json: unknown | null = null
          try {
            json = text ? (JSON.parse(text) as unknown) : null
          } catch {
            json = null
          }
          resolve({ status: res.statusCode ?? 0, json, text })
        })
      }
    )
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

function pickBalanceBrl(data: unknown): number | null {
  if (data == null) return null
  if (typeof data === 'number' && !Number.isNaN(data)) return data
  if (typeof data === 'object' && data !== null) {
    const o = data as Record<string, unknown>
    const tryNum = (v: unknown) => {
      if (typeof v === 'number' && !Number.isNaN(v)) return v
      if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(String(v).replace(',', '.'))
        return Number.isNaN(n) ? null : n
      }
      return null
    }
    for (const key of ['disponivel', 'saldo', 'available', 'balance', 'valor']) {
      const n = tryNum(o[key])
      if (n != null) return n
    }
    const balances = o.balances
    if (Array.isArray(balances) && balances[0] && typeof balances[0] === 'object') {
      const b0 = balances[0] as Record<string, unknown>
      for (const key of ['disponivel', 'saldo', 'available']) {
        const n = tryNum(b0[key])
        if (n != null) return n
      }
    }
  }
  return null
}

/**
 * Obtém saldo em BRL na conta vinculada à integração (quando a API retorna um único saldo).
 */
export async function fetchBancoInterSaldoBrl(): Promise<InterSaldoResult> {
  const clientId = process.env.BANCO_INTER_CLIENT_ID?.trim()
  const clientSecret = process.env.BANCO_INTER_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    return { ok: false, code: 'NOT_CONFIGURED', detail: 'BANCO_INTER_CLIENT_ID/SECRET ausentes' }
  }

  const tokenUrl =
    process.env.BANCO_INTER_TOKEN_URL?.trim() || 'https://cdpj.partners.bancointer.com.br/oauth/v2/token'
  const bankingBase =
    process.env.BANCO_INTER_BANKING_BASE?.trim() || 'https://cdpj.partners.bancointer.com.br'
  const saldoPath = process.env.BANCO_INTER_SALDO_PATH?.trim() || '/banking/v2/saldo'
  const scope = process.env.BANCO_INTER_SCOPE?.trim()

  let agent: https.Agent | undefined
  try {
    agent = readTlsAgent()
  } catch (e) {
    return {
      ok: false,
      code: 'TLS_ERROR',
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  const body = new URLSearchParams()
  body.set('client_id', clientId)
  body.set('client_secret', clientSecret)
  body.set('grant_type', 'client_credentials')
  if (scope) body.set('scope', scope)

  let tokenRes: { status: number; json: unknown | null; text: string }
  try {
    tokenRes = await httpsRequestJson({
      method: 'POST',
      href: tokenUrl,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
      agent,
    })
  } catch (e) {
    return {
      ok: false,
      code: 'TOKEN_FAILED',
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  const tokenJson = tokenRes.json as Record<string, unknown> | null
  const accessToken =
    tokenJson && typeof tokenJson.access_token === 'string' ? tokenJson.access_token : null
  if (!accessToken || tokenRes.status >= 400) {
    return {
      ok: false,
      code: 'TOKEN_FAILED',
      detail: tokenRes.text?.slice(0, 500) || `HTTP ${tokenRes.status}`,
    }
  }

  const saldoHref = `${bankingBase.replace(/\/$/, '')}${saldoPath.startsWith('/') ? '' : '/'}${saldoPath}`
  const extraQuery = process.env.BANCO_INTER_SALDO_QUERY?.trim()
  const saldoUrl = extraQuery ? `${saldoHref}${saldoHref.includes('?') ? '&' : '?'}${extraQuery}` : saldoHref

  let saldoRes: { status: number; json: unknown | null; text: string }
  try {
    saldoRes = await httpsRequestJson({
      method: 'GET',
      href: saldoUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      agent,
    })
  } catch (e) {
    return {
      ok: false,
      code: 'SALDO_FAILED',
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  if (saldoRes.status >= 400) {
    return {
      ok: false,
      code: 'SALDO_FAILED',
      detail: saldoRes.text?.slice(0, 500) || `HTTP ${saldoRes.status}`,
    }
  }

  const balanceBrl = pickBalanceBrl(saldoRes.json)
  if (balanceBrl == null) {
    return { ok: false, code: 'PARSE_ERROR', detail: saldoRes.text?.slice(0, 300) }
  }

  return { ok: true, balanceBrl, raw: saldoRes.json }
}
