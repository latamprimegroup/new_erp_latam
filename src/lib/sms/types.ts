/**
 * Tipos para provedores de aluguel de números e SMS
 */

export type SmsProviderOrder = {
  orderId: string
  phoneNumber: string
  country: string
  operator?: string
  service: string
  expiresAt?: Date
}

export type SmsReceived = {
  id?: string
  sender?: string
  body: string
  code?: string
  receivedAt?: Date
}

export type RentNumberOptions = {
  country: string
  operator?: string
  service?: string
}

export type SmsProvider = {
  name: string
  rentNumber: (opts: RentNumberOptions) => Promise<SmsProviderOrder | null>
  checkSms: (orderId: string) => Promise<SmsReceived | null>
  releaseNumber?: (orderId: string) => Promise<boolean>
}
