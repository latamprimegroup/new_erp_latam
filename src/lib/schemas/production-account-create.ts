import { z } from 'zod'

export const PRODUCTION_NICHES = ['NUTRA', 'IGAMING', 'LOCAL', 'ECOM', 'OTHER'] as const
export const VERIFICATION_GOALS = ['G2_AND_ADVERTISER', 'ADVERTISER_AND_COMMERCIAL_OPS'] as const

/**
 * Corpo do POST /api/producao — espelhado no cliente (ProducaoClient) para validação antes do envio.
 */
export const productionAccountCreateSchema = z
  .object({
    accountCode: z.string().min(2).max(120),
    platform: z.enum(['GOOGLE_ADS', 'META_ADS', 'KWAI_ADS', 'TIKTOK_ADS', 'OTHER']),
    type: z.string().min(1),
    productionNiche: z.enum(PRODUCTION_NICHES),
    verificationGoal: z.enum(VERIFICATION_GOALS),
    primaryDomain: z.string().optional(),
    countryId: z.string().optional(),
    password: z.string().min(1).optional(),
    googleAdsCustomerId: z.string().optional(),
    currency: z.string().max(5).optional(),
    a2fCode: z.string().optional(),
    g2ApprovalCode: z.string().optional(),
    siteUrl: z.string().optional().refine((v) => !v || v.startsWith('http'), { message: 'URL inválida' }),
    cnpjBizLink: z.string().optional().refine((v) => !v || v.startsWith('http'), { message: 'URL inválida' }),
    proxyNote: z.string().max(500).optional(),
    proxyConfigured: z.boolean().optional(),
    emailId: z.string().optional(),
    cnpjId: z.string().optional(),
    paymentProfileId: z.string().optional(),
    email: z.union([z.string().email(), z.literal('')]).optional(),
    cnpj: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.password?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Senha é obrigatória.',
        path: ['password'],
      })
    }
    if (!data.a2fCode?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '2FA é obrigatório.',
        path: ['a2fCode'],
      })
    }
    if (!data.emailId && !data.email?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'E-mail é obrigatório (manual ou reservado).',
        path: ['email'],
      })
    }
    if (data.platform === 'GOOGLE_ADS') {
      const d = data.googleAdsCustomerId?.replace(/\D/g, '') ?? ''
      if (d.length !== 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'ID da conta Google Ads é obrigatório (10 dígitos, formato 000-000-0000).',
          path: ['googleAdsCustomerId'],
        })
      }
    }
  })

export type ProductionAccountCreateInput = z.infer<typeof productionAccountCreateSchema>
