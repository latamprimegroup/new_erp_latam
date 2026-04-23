/**
 * Utmify — Integração de Rastreamento de ROI
 *
 * Dois eventos disparados:
 *   1. initiated_checkout  → quando PIX é gerado (início de checkout)
 *   2. paid               → quando Inter confirma pagamento
 *
 * Variáveis de ambiente:
 *   UTMIFY_API_TOKEN — token gerado em app.utmify.com.br > Integrações
 */

const UTMIFY_URL = 'https://api.utmify.com.br/api-credentials/orders'

export type UtmifyOrder = {
  orderId:       string      // ID único da nossa venda (SalesCheckout.id)
  platform:      string      // "Ads Ativos"
  paymentMethod: string      // "pix"
  status:        'paid' | 'refunded' | 'cancelled' | 'waiting_payment'
  createdAt:     string      // ISO 8601
  approvedDate:  string      // ISO 8601
  refundedAt?:   string

  customer: {
    name:      string
    email:     string
    phone:     string   // E.164
    document:  string   // CPF apenas dígitos
  }

  products: Array<{
    id:       string
    name:     string
    planId:   string
    planName: string
    quantity: number
    priceInCents: number
  }>

  trackingParameters: {
    src?:          string
    sck?:          string
    utm_source?:   string
    utm_medium?:   string
    utm_campaign?: string
    utm_content?:  string
    utm_term?:     string
  }

  commission: {
    totalPriceInCents:    number
    gatewayFeeInCents:    number
    userCommissionInCents: number
  }
}

// ─── Utilitário interno ───────────────────────────────────────────────────────

async function postToUtmify(order: UtmifyOrder): Promise<boolean> {
  const token = process.env.UTMIFY_API_TOKEN
  if (!token) {
    console.warn('[Utmify] UTMIFY_API_TOKEN não configurado — ignorando')
    return false
  }
  try {
    const res = await fetch(UTMIFY_URL, {
      method:  'POST',
      headers: { 'x-api-token': token, 'Content-Type': 'application/json' },
      body:    JSON.stringify(order),
    })
    if (!res.ok) {
      console.error(`[Utmify] Falha (${res.status}):`, await res.text())
      return false
    }
    return true
  } catch (err) {
    console.error('[Utmify] Erro inesperado:', err)
    return false
  }
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
  buyer: {
    name:     string
    email:    string
    whatsapp: string
    cpf:      string
  }
  utms: {
    utm_source?:   string
    utm_medium?:   string
    utm_campaign?: string
    utm_content?:  string
    utm_term?:     string
  }
}): Promise<boolean> {
  const totalCents = Math.round(params.amountBrl * 100)
  const iso        = params.createdAt.toISOString()

  const order: UtmifyOrder = {
    orderId:       `${params.checkoutId}_init`,
    platform:      'Ads Ativos',
    paymentMethod: 'pix',
    status:        'waiting_payment',
    createdAt:     iso,
    approvedDate:  iso,
    customer: {
      name:     params.buyer.name,
      email:    params.buyer.email || `${params.buyer.cpf.replace(/\D/g,'')}@lead.adsativos.com`,
      phone:    params.buyer.whatsapp,
      document: params.buyer.cpf.replace(/\D/g, ''),
    },
    products: [{
      id:           params.adsId,
      name:         params.displayName,
      planId:       params.adsId,
      planName:     'Conta Google Ads — Ads Ativos',
      quantity:     1,
      priceInCents: totalCents,
    }],
    trackingParameters: {
      utm_source:   params.utms.utm_source,
      utm_medium:   params.utms.utm_medium,
      utm_campaign: params.utms.utm_campaign,
      utm_content:  params.utms.utm_content,
      utm_term:     params.utms.utm_term,
    },
    commission: {
      totalPriceInCents:     totalCents,
      gatewayFeeInCents:     0,
      userCommissionInCents: totalCents,
    },
  }

  return postToUtmify(order)
}

// ─── Evento 2: Venda Aprovada (paid) ─────────────────────────────────────────

/**
 * Dispara evento de venda aprovada para a Utmify.
 * Falha silenciosamente (loga mas não quebra o fluxo de entrega).
 */
export async function sendUtmifyConversion(params: {
  checkoutId:  string
  adsId:       string
  displayName: string
  amountBrl:   number
  paidAt:      Date
  createdAt:   Date
  buyer: {
    name:     string
    email:    string
    whatsapp: string
    cpf:      string
  }
  utms: {
    utm_source?:   string
    utm_medium?:   string
    utm_campaign?: string
    utm_content?:  string
    utm_term?:     string
  }
}): Promise<boolean> {
  // Taxa de gateway estimada: 0,99% + R$0,49 (PIX Inter)
  const totalCents   = Math.round(params.amountBrl * 100)
  const gatewayFee   = Math.round(totalCents * 0.0099 + 49)
  const netCents     = totalCents - gatewayFee

  const order: UtmifyOrder = {
    orderId:       params.checkoutId,
    platform:      'Ads Ativos',
    paymentMethod: 'pix',
    status:        'paid',
    createdAt:     params.createdAt.toISOString(),
    approvedDate:  params.paidAt.toISOString(),

    customer: {
      name:     params.buyer.name,
      email:    params.buyer.email || `${params.buyer.cpf.replace(/\D/g, '')}@lead.adsativos.com`,
      phone:    params.buyer.whatsapp,
      document: params.buyer.cpf.replace(/\D/g, ''),
    },

    products: [{
      id:           params.adsId,
      name:         params.displayName,
      planId:       params.adsId,
      planName:     'Conta Google Ads — Ads Ativos',
      quantity:     1,
      priceInCents: totalCents,
    }],

    trackingParameters: {
      utm_source:   params.utms.utm_source,
      utm_medium:   params.utms.utm_medium,
      utm_campaign: params.utms.utm_campaign,
      utm_content:  params.utms.utm_content,
      utm_term:     params.utms.utm_term,
    },

    commission: {
      totalPriceInCents:     totalCents,
      gatewayFeeInCents:     gatewayFee,
      userCommissionInCents: netCents,
    },
  }

  const ok = await postToUtmify(order)
  if (ok) console.log(`[Utmify] Conversão enviada — orderId: ${params.checkoutId}`)
  return ok
}
