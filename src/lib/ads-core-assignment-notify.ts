import { sendInApp } from '@/lib/notifications/channels/in-app'
import { formatCnpjDisplay } from '@/lib/ads-core-utils'

/** Notifica o produtor quando recebe (ou é transferido para) uma demanda ADS CORE. */
export async function notifyProducerAdsCoreAssignment(opts: {
  producerId: string
  assetId: string
  cnpj: string
  nicheName: string
}): Promise<void> {
  const cnpjFmt = formatCnpjDisplay(opts.cnpj)
  await sendInApp({
    userId: opts.producerId,
    type: 'ADS_CORE_ASSIGNMENT',
    title: 'Nova demanda ADS CORE',
    message: `Você foi definido como responsável pela execução do ativo ${cnpjFmt} (nicho: ${opts.nicheName}). O CNPJ fica exclusivo na sua fila até nova definição do administrador.`,
    link: '/dashboard/ads-core',
    metadata: { assetId: opts.assetId, module: 'ads_core' },
    priority: 'HIGH',
  })
}
