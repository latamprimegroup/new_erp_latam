/**
 * Utmify — Integração Server-to-Server (S2S)
 *
 * Envia conversões diretamente para a Utmify via API Key.
 * Endpoint: POST https://api.utmify.com.br/api-credentials/orders
 *
 * Recursos:
 *   ✅ Retry automático (3 tentativas com backoff exponencial)
 *   ✅ Anti-duplicata via orderId único por checkout
 *   ✅ ProfileType como tag de produto (segmentação por vertical no dashboard)
 *   ✅ UTMs completos: source, medium, campaign, content, term, src
 *   ✅ Lucro real como userCommission (não faturamento bruto)
 *   ✅ Retorna utmifyOrderId para persistência no banco (prova de envio)
 *
 * Variável de ambiente:
 *   UTMIFY_API_TOKEN — sobrescreve a chave padrão se definida
 */

const UTMIFY_URL     = 'https://api.utmify.com.br/api-credentials/orders'
// Chave primária definida em .env; fallbacks em ordem de prioridade
const UTMIFY_API_KEY = process.env.UTMIFY_API_TOKEN
  ?? process.env.UTMIFY_API_KEY_ALT  // chave alternativa (B2BjZ6Mnog1HHlxX26qq36Y1VGV8fbEG)
  ?? 'KapTbUfIp64fDUgQW4xH27aiMqBYTvbKmXaB'
const MAX_RETRIES    = 3
const RETRY_BASE_MS  = 1_000

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type UtmParams = {
  src?:          string
  sck?:          string
  utm_source?:   string
  utm_medium?:   string
  utm_campaign?: string
  utm_content?:  string
  utm_term?:     string
}

export type UtmifyOrder = {
  orderId:       string
  platform:      string
  paymentMethod: string
  status:        'paid' | 'refunded' | 'cancelled' | 'waiting_payment'
  createdAt:     string
  approvedDate:  string
  refundedAt?:   string

  customer: {
    name:      string
    email:     string
    phone:     string
    document:  string
  }

  products: Array<{
    id:           string
    name:         string
    planId:       string
    planName:     string
    quantity:     number
    priceInCents: number
  }>

  trackingParameters: UtmParams

  commission: {
    totalPriceInCents:     number
    gatewayFeeInCents:     number
    userCommissionInCents: number
  }
}

// ─── Mapeamento de ProfileType → rótulo de produto (segmentação Utmify) ───────

const PROFILE_PLAN_LABEL: Record<string, string> = {
  TRADER_WHATSAPP:       'Ativo Transacional',
  LOCAL_BUSINESS:        'SaaS Local Business',
  MENTORADO:             'Mentoria High-Ticket',
  DIRECT_RESPONSE_SCALE: 'Escala Direct Response',
  INFRA_PARTNER:         'Infra Partner',
  RENTAL_USER:           'Aluguel de Contas',
}

// ─── Utilitários internos ─────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

/**
 * POST para a Utmify com retry automático (backoff exponencial).
 * Retorna `{ ok: boolean; utmifyOrderId?: string }`.
 */
async function postToUtmify(order: UtmifyOrder): Promise<{ ok: boolean; utmifyOrderId?: string }> {
  let attempt = 0

  while (attempt < MAX_RETRIES) {
    attempt++
    try {
      const res = await fetch(UTMIFY_URL, {
        method:  'POST',
        headers: {
          'x-api-token':  UTMIFY_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(order),
      })

      if (res.ok) {
        let utmifyOrderId: string | undefined
        try {
          const json = await res.json() as Record<string, unknown>
          // A Utmify pode retornar { id, orderId, ... } dependendo da versão da API
          utmifyOrderId = (json.id ?? json.orderId ?? json.order_id) as string | undefined
        } catch {
          // Resposta sem JSON — OK, apenas sem ID externo
        }

        console.log(`[Utmify] ✅ Enviado (tentativa ${attempt}) — orderId: ${order.orderId}${utmifyOrderId ? ` · utmifyId: ${utmifyOrderId}` : ''}`)
        return { ok: true, utmifyOrderId }
      }

      // Erro 4xx → não adianta fazer retry (erro de dados)
      if (res.status >= 400 && res.status < 500) {
        const body = await res.text().catch(() => '')
        console.error(`[Utmify] ❌ Erro ${res.status} (sem retry): ${body}`)
        return { ok: false }
      }

      // Erro 5xx → retry
      console.warn(`[Utmify] ⚠️ Erro ${res.status} — tentativa ${attempt}/${MAX_RETRIES}`)

    } catch (err) {
      console.warn(`[Utmify] ⚠️ Falha de rede — tentativa ${attempt}/${MAX_RETRIES}:`, err)
    }

    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1)) // 1s, 2s, 4s
    }
  }

  console.error(`[Utmify] ❌ Falha após ${MAX_RETRIES} tentativas — orderId: ${order.orderId}`)
  return { ok: false }
}

// ─── Evento 1: PIX Gerado (initiated_checkout) ────────────────────────────────

/**
 * Disparado logo após o Inter gerar a cobrança PIX.
 * Permite que a Utmify rastreie abandono de checkout.
 */
export async function sendUtmifyPixGerado(params: {
  checkoutId:  string
  adsId:       string
  displayName: string
  amountBrl:   number
  createdAt:   Date
  profileType?: string | null
  buyer: {
    name:     string
    email:    string
    whatsapp: string
    cpf:      string
    document?: string
  }
  utms: UtmParams
}): Promise<boolean> {
  const totalCents  = Math.round(params.amountBrl * 100)
  const iso         = params.createdAt.toISOString()
  const planLabel   = PROFILE_PLAN_LABEL[params.profileType ?? ''] ?? 'Ativo Ads Ativos'
  const docClean    = (params.buyer.document ?? params.buyer.cpf).replace(/\D/g, '')

  const order: UtmifyOrder = {
    orderId:       `${params.checkoutId}_init`,
    platform:      'Ads Ativos Global',
    paymentMethod: 'pix',
    status:        'waiting_payment',
    createdAt:     iso,
    approvedDate:  iso,
    customer: {
      name:     params.buyer.name,
      email:    params.buyer.email || `${docClean}@lead.adsativos.com`,
      phone:    params.buyer.whatsapp,
      document: docClean,
    },
    products: [{
      id:           params.adsId,
      name:         params.displayName,
      planId:       params.profileType ?? 'TRADER_WHATSAPP',
      planName:     planLabel,
      quantity:     1,
      priceInCents: totalCents,
    }],
    trackingParameters: params.utms,
    commission: {
      totalPriceInCents:     totalCents,
      gatewayFeeInCents:     0,
      userCommissionInCents: totalCents,
    },
  }

  const { ok } = await postToUtmify(order)
  return ok
}

// ─── Evento 2: Venda Aprovada (paid) ─────────────────────────────────────────

export type UtmifyConversionParams = {
  checkoutId:   string
  adsId:        string
  displayName:  string
  amountBrl:    number
  /** Lucro real = amountBrl - custo ativo - taxa gateway */
  netProfitBrl?: number
  paidAt:        Date
  createdAt:     Date
  /** ProfileType do comprador para segmentação por vertical no dashboard Utmify */
  profileType?:  string | null
  buyer: {
    name:     string
    email:    string
    whatsapp: string
    cpf:      string
    document?: string
  }
  utms: UtmParams
}

/**
 * Dispara evento de venda aprovada para a Utmify.
 * Retorna o utmifyOrderId retornado pela API (ou undefined se falhou).
 *
 * Anti-duplicata: o caller deve verificar `utmifySent` antes de chamar.
 */
export async function sendUtmifyConversion(
  params: UtmifyConversionParams,
): Promise<{ ok: boolean; utmifyOrderId?: string }> {
  // Taxa real PIX Inter: 0,99% + R$ 0,49 por transação
  const totalCents = Math.round(params.amountBrl * 100)
  const gatewayFee = Math.round(totalCents * 0.0099 + 49)

  // Lucro real enviado como userCommission — a Utmify usa esse campo para ROI real
  const netCents = params.netProfitBrl != null
    ? Math.max(0, Math.round(params.netProfitBrl * 100))
    : Math.max(0, totalCents - gatewayFee)

  const planLabel  = PROFILE_PLAN_LABEL[params.profileType ?? ''] ?? 'Ativo Ads Ativos'
  const docClean   = (params.buyer.document ?? params.buyer.cpf).replace(/\D/g, '')

  const order: UtmifyOrder = {
    orderId:       params.checkoutId,
    platform:      'Ads Ativos Global',
    paymentMethod: 'pix',
    status:        'paid',
    createdAt:     params.createdAt.toISOString(),
    approvedDate:  params.paidAt.toISOString(),

    customer: {
      name:     params.buyer.name,
      email:    params.buyer.email || `${docClean}@lead.adsativos.com`,
      phone:    params.buyer.whatsapp,
      document: docClean,
    },

    products: [{
      id:           params.adsId,
      name:         params.displayName,
      // planId = ProfileType → filtrável no dashboard Utmify ("Qual campanha traz mais Mentorados?")
      planId:       params.profileType ?? 'TRADER_WHATSAPP',
      planName:     planLabel,
      quantity:     1,
      priceInCents: totalCents,
    }],

    trackingParameters: params.utms,

    commission: {
      totalPriceInCents:     totalCents,
      gatewayFeeInCents:     gatewayFee,
      userCommissionInCents: netCents,
    },
  }

  return postToUtmify(order)
}

// ─── Evento 3: QuickSaleCheckout aprovado ────────────────────────────────────

export type UtmifyQuickSaleParams = {
  checkoutId:   string
  listingTitle: string
  listingSlug:  string
  totalAmount:  number
  netProfit?:   number
  qty:          number
  paidAt:       Date
  createdAt:    Date
  profileType?: string | null
  buyer: {
    name:       string
    email:      string | null
    whatsapp:   string
    document?:  string
  }
  utms: UtmParams
}

/**
 * Variante específica para QuickSaleCheckout (loja pública adsativos.store).
 * Já inclui anti-duplicata e retorna utmifyOrderId para persistência.
 */
export async function sendUtmifyQuickSaleConversion(
  params: UtmifyQuickSaleParams,
): Promise<{ ok: boolean; utmifyOrderId?: string }> {
  const totalCents = Math.round(params.totalAmount * 100)
  const gatewayFee = Math.round(totalCents * 0.0099 + 49)
  const netCents   = params.netProfit != null
    ? Math.max(0, Math.round(params.netProfit * 100))
    : Math.max(0, totalCents - gatewayFee)

  const planLabel  = PROFILE_PLAN_LABEL[params.profileType ?? ''] ?? 'Ativo Ads Ativos'
  const docClean   = (params.buyer.document ?? '').replace(/\D/g, '')
  const email      = params.buyer.email
    ?? (docClean ? `${docClean}@lead.adsativos.com` : `${params.checkoutId}@lead.adsativos.com`)

  const order: UtmifyOrder = {
    orderId:       params.checkoutId,
    platform:      'Ads Ativos Global',
    paymentMethod: 'pix',
    status:        'paid',
    createdAt:     params.createdAt.toISOString(),
    approvedDate:  params.paidAt.toISOString(),

    customer: {
      name:     params.buyer.name,
      email,
      phone:    params.buyer.whatsapp,
      document: docClean,
    },

    products: [{
      id:           params.listingSlug,
      name:         `${params.listingTitle}${params.qty > 1 ? ` (x${params.qty})` : ''}`,
      planId:       params.profileType ?? 'TRADER_WHATSAPP',
      planName:     planLabel,
      quantity:     params.qty,
      priceInCents: totalCents,
    }],

    trackingParameters: params.utms,

    commission: {
      totalPriceInCents:     totalCents,
      gatewayFeeInCents:     gatewayFee,
      userCommissionInCents: netCents,
    },
  }

  return postToUtmify(order)
}
