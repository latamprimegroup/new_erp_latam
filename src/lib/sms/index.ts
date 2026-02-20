/**
 * Provedores de SMS - aluguel de números para validação (Google etc.)
 */
import { create5simProvider } from './fivesim'
import type { SmsProvider, RentNumberOptions, SmsProviderOrder, SmsReceived } from './types'

let _provider: SmsProvider | null = null

export function getSmsProvider(): SmsProvider | null {
  if (_provider) return _provider
  _provider = create5simProvider()
  return _provider
}

export async function rentPhoneNumber(opts: RentNumberOptions): Promise<SmsProviderOrder | null> {
  const p = getSmsProvider()
  if (!p) return null
  return p.rentNumber(opts)
}

export async function checkSmsForOrder(orderId: string): Promise<SmsReceived | null> {
  const p = getSmsProvider()
  if (!p) return null
  return p.checkSms(orderId)
}

export async function releasePhoneNumber(orderId: string): Promise<boolean> {
  const p = getSmsProvider()
  if (!p?.releaseNumber) return false
  return p.releaseNumber(orderId)
}

export type { SmsProvider, RentNumberOptions, SmsProviderOrder, SmsReceived }
