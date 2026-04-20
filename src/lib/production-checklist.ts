/** Passos do checklist de produção (ordem de exibição / prioridade). */
export const PRODUCTION_CHECKLIST_STEPS = [
  'LEAD_ORIGEM_OK',
  'WHATSAPP_CONTATO_OK',
  'EMAIL_OK',
  'CNPJ_OK',
  'PAGAMENTO_OK',
  'PLATAFORMA_CRIADA',
  'DADOS_VERIFICADOS',
] as const

export type ProductionChecklistStep = (typeof PRODUCTION_CHECKLIST_STEPS)[number]

export const PRODUCTION_CHECKLIST_LABELS: Record<string, string> = {
  LEAD_ORIGEM_OK: '1. Lead / origem registrada',
  WHATSAPP_CONTATO_OK: '2. WhatsApp validado com o lead',
  EMAIL_OK: '3. E-mail válido e configurado',
  CNPJ_OK: '4. CNPJ vinculado e ativo',
  PAGAMENTO_OK: '5. Perfil de pagamento configurado',
  PLATAFORMA_CRIADA: '6. Conta criada na plataforma',
  DADOS_VERIFICADOS: '7. Dados conferidos (pré-envio)',
}
