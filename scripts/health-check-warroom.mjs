#!/usr/bin/env node
/**
 * Health Check diário — War Room OS (Ads Ativos)
 *
 * Objetivo:
 * - validar rotas públicas críticas do checkout invisível/decoy;
 * - validar conectividade da URL Ngrok/AdsPower (quando configurada).
 *
 * Uso rápido:
 *   npm run health:daily
 *
 * Variáveis opcionais:
 *   HEALTH_BASE_URL=https://www.adsativos.com
 *   HEALTH_TIMEOUT_MS=10000
 *   HEALTH_NGROK_URL=https://xxxx.ngrok-free.app
 *   ADSPOWER_LOCAL_API_URL=https://xxxx.ngrok-free.app
 *   QUICK_SALE_HEALTH_SLUG=perfil-real-facebook
 */

const BASE_URL = (process.env.HEALTH_BASE_URL || 'https://www.adsativos.com').replace(/\/$/, '')
const TIMEOUT_MS = Number(process.env.HEALTH_TIMEOUT_MS || 10000)
const NGROK_BASE =
  (process.env.HEALTH_NGROK_URL || process.env.ADSPOWER_LOCAL_API_URL || '').trim().replace(/\/$/, '')
const QUICK_SALE_HEALTH_SLUG = (process.env.QUICK_SALE_HEALTH_SLUG || '').trim()

const checks = []

function addCheck(name, ok, details, fatal = true) {
  checks.push({ name, ok, details, fatal })
}

async function fetchWithTimeout(url, init = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function joinUrl(base, path) {
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function printHeader() {
  console.log('🛰️  War Room OS — Daily Health Check')
  console.log(`🌐 Base URL: ${BASE_URL}`)
  console.log(`⏱️  Timeout: ${TIMEOUT_MS}ms`)
  if (NGROK_BASE) console.log(`🔗 Ngrok/AdsPower URL: ${NGROK_BASE}`)
  else console.log('🔗 Ngrok/AdsPower URL: não configurada (checagem será ignorada)')
  console.log('')
}

async function checkDecoyPage() {
  const url = joinUrl(BASE_URL, '/pagina-isca')
  try {
    const res = await fetchWithTimeout(url)
    addCheck(
      'Página Isca pública',
      res.status === 200,
      `GET ${url} -> HTTP ${res.status}`,
    )
  } catch (e) {
    addCheck('Página Isca pública', false, `GET ${url} -> erro: ${String(e)}`)
  }
}

async function checkInvisibleIssuerRoute() {
  const url = joinUrl(BASE_URL, '/pay/one/new')
  try {
    const res = await fetchWithTimeout(url, { redirect: 'manual' })
    // Sem slug, a rota existente devolve 400 "Slug obrigatório."
    addCheck(
      'Emissor de link efêmero (/pay/one/new)',
      res.status === 400,
      `GET ${url} -> HTTP ${res.status} (esperado 400 sem slug)`,
    )
  } catch (e) {
    addCheck('Emissor de link efêmero (/pay/one/new)', false, `GET ${url} -> erro: ${String(e)}`)
  }
}

async function checkInvisibleGateRoute() {
  const token = `health-token-${Date.now()}`
  const url = joinUrl(BASE_URL, `/pay/one/${encodeURIComponent(token)}`)
  try {
    const res = await fetchWithTimeout(url, { redirect: 'manual' })
    // Token inexistente na rota existente retorna 404 (Checkout indisponível.)
    addCheck(
      'Gate do checkout invisível (/pay/one/[token])',
      res.status === 404,
      `GET ${url} -> HTTP ${res.status} (esperado 404 para token inválido)`,
    )
  } catch (e) {
    addCheck('Gate do checkout invisível (/pay/one/[token])', false, `GET ${url} -> erro: ${String(e)}`)
  }
}

async function checkDecoyClickApi() {
  const url = joinUrl(BASE_URL, '/api/public/decoy-whatsapp-click')
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'health-check',
        reason: 'daily-monitor',
        code: `hc-${Date.now()}`,
      }),
    })
    const ok = res.status === 200
    addCheck(
      'API pública de tracking da Página Isca',
      ok,
      `POST ${url} -> HTTP ${res.status}`,
    )
  } catch (e) {
    addCheck('API pública de tracking da Página Isca', false, `POST ${url} -> erro: ${String(e)}`)
  }
}

async function checkIssuerWithSlugWhenConfigured() {
  if (!QUICK_SALE_HEALTH_SLUG) {
    addCheck(
      'Emissão com slug real (opcional)',
      true,
      'Ignorado (configure QUICK_SALE_HEALTH_SLUG para validar emissão real).',
      false,
    )
    return
  }

  const url = joinUrl(
    BASE_URL,
    `/pay/one/new?mode=PIX&slug=${encodeURIComponent(QUICK_SALE_HEALTH_SLUG)}&src=health-check`,
  )

  try {
    const res = await fetchWithTimeout(url, { redirect: 'manual' })
    // Em caso de slug válido, rota deve redirecionar para /pay/one/{token}
    const location = res.headers.get('location') || ''
    const ok = res.status === 302 && location.includes('/pay/one/')
    addCheck(
      'Emissão efêmera com slug real',
      ok,
      `GET ${url} -> HTTP ${res.status}${location ? ` | location: ${location}` : ''}`,
    )
  } catch (e) {
    addCheck('Emissão efêmera com slug real', false, `GET ${url} -> erro: ${String(e)}`)
  }
}

async function checkAdsPowerNgrokStatus() {
  if (!NGROK_BASE) {
    addCheck(
      'Ngrok/AdsPower /status',
      true,
      'Ignorado (configure HEALTH_NGROK_URL ou ADSPOWER_LOCAL_API_URL).',
      false,
    )
    return
  }

  const url = joinUrl(NGROK_BASE, '/status')
  try {
    const res = await fetchWithTimeout(url, { redirect: 'manual' })
    const raw = await res.text()
    let parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
    const code = parsed && typeof parsed === 'object' ? parsed.code : undefined
    const ok = res.ok && code === 0
    addCheck(
      'Ngrok/AdsPower /status',
      ok,
      `GET ${url} -> HTTP ${res.status}${code !== undefined ? ` | code: ${String(code)}` : ''}`,
    )
  } catch (e) {
    addCheck('Ngrok/AdsPower /status', false, `GET ${url} -> erro: ${String(e)}`)
  }
}

function printSummaryAndExit() {
  let failedFatal = 0
  let failedNonFatal = 0

  for (const c of checks) {
    const icon = c.ok ? '✅' : c.fatal ? '❌' : '⚠️'
    console.log(`${icon} ${c.name}`)
    console.log(`   ${c.details}`)
    if (!c.ok && c.fatal) failedFatal += 1
    if (!c.ok && !c.fatal) failedNonFatal += 1
  }

  console.log('')
  console.log(
    `Resumo: ${checks.length} checks | falhas críticas: ${failedFatal} | avisos: ${failedNonFatal}`,
  )

  if (failedFatal > 0) {
    process.exit(1)
  }
}

async function main() {
  printHeader()
  await checkDecoyPage()
  await checkInvisibleIssuerRoute()
  await checkInvisibleGateRoute()
  await checkDecoyClickApi()
  await checkIssuerWithSlugWhenConfigured()
  await checkAdsPowerNgrokStatus()
  printSummaryAndExit()
}

main().catch((error) => {
  console.error('Falha inesperada no health check:', error)
  process.exit(1)
})
