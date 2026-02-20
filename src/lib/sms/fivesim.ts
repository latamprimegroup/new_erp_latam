/**
 * Provedor 5sim.net - Aluguel de números para receber SMS (validação Google etc.)
 * Docs: https://5sim.net/en/docs
 * Auth: Authorization: Bearer API_KEY
 */
import type { RentNumberOptions, SmsProvider, SmsProviderOrder, SmsReceived } from './types'

const BASE = 'https://5sim.net/v1/user'
const DEFAULT_SERVICE = 'google'

function extractCode(text: string): string | null {
  const match = text.match(/\b(\d{4,8})\b/)
  return match ? match[1] : null
}

async function request<T>(
  path: string,
  apiKey: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`5sim API error ${res.status}: ${err}`)
  }
  return res.json() as Promise<T>
}

export function create5simProvider(): SmsProvider | null {
  const apiKey = process.env.FIVESIM_API_KEY?.trim()
  if (!apiKey) return null

  return {
    name: '5sim',

    async rentNumber(opts: RentNumberOptions): Promise<SmsProviderOrder | null> {
      const country = opts.country || process.env.FIVESIM_DEFAULT_COUNTRY || 'brazil'
      const operator = opts.operator || process.env.FIVESIM_DEFAULT_OPERATOR || 'any'
      const service = opts.service || DEFAULT_SERVICE

      type BuyResponse = {
        id?: number
        phone?: string
        operator?: string
        product?: string
        price?: number
        status?: string
        expires?: string
        created_at?: string
      }

      const data = await request<BuyResponse>(
        `/buy/activation/${country}/${operator}/${service}`,
        apiKey
      )

      if (!data?.id || !data?.phone) {
        return null
      }

      return {
        orderId: String(data.id),
        phoneNumber: data.phone.startsWith('+') ? data.phone : `+${data.phone}`,
        country,
        operator: data.operator,
        service: data.product || service,
        expiresAt: data.expires ? new Date(data.expires) : undefined,
      }
    },

    async checkSms(orderId: string): Promise<SmsReceived | null> {
      type CheckResponse = {
        id?: number
        phone?: string
        text?: string
        code?: string
        sender?: string
        created_at?: string
        received_at?: string
      }

      const data = await request<CheckResponse>(`/check/${orderId}`, apiKey)

      if (!data?.text) return null

      const code = data.code || extractCode(data.text)

      return {
        sender: data.sender,
        body: data.text,
        code: code ?? undefined,
        receivedAt: data.received_at ? new Date(data.received_at) : new Date(),
      }
    },

    async releaseNumber(orderId: string): Promise<boolean> {
      try {
        await request(`/cancel/${orderId}`, apiKey, { method: 'GET' })
        return true
      } catch {
        return false
      }
    },
  }
}
