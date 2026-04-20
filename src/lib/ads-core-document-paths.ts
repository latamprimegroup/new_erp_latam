import type { AdsCoreDocType } from '@/lib/ads-core-utils'

export function adsCoreDocRelPath(
  asset: {
    docCnpjPath: string | null
    docRgFrentePath: string | null
    docRgVersoPath: string | null
  },
  tipo: AdsCoreDocType
): string | null {
  switch (tipo) {
    case 'cnpj':
      return asset.docCnpjPath
    case 'rg-frente':
      return asset.docRgFrentePath
    case 'rg-verso':
      return asset.docRgVersoPath
  }
}
