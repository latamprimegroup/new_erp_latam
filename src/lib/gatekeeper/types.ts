/**
 * Geofencing obrigatório após ingestão Gatekeeper (Módulo 01) para Módulo 02 (Geo-Provision).
 * Persistido em `inventory_cnpjs.geofencing` (JSON).
 */
export type VaultGeofencing = {
  cidade: string
  estado: string
  cep: string | null
}

/** Metadados de documento de ID após scrub server-side. */
export type VaultIdDocRef = {
  kind: 'scrubbed_id_doc'
  key: string
  contentMd5: string
}

export function assertVaultGeofencing(value: unknown): VaultGeofencing {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Geofencing inválido: objeto obrigatório para ancoragem (Módulo 02)')
  }
  const o = value as Record<string, unknown>
  const cidade = typeof o.cidade === 'string' ? o.cidade.trim() : ''
  const estado = typeof o.estado === 'string' ? o.estado.trim().toUpperCase().slice(0, 2) : ''
  const cepRaw = o.cep
  const cep =
    cepRaw === null || cepRaw === undefined
      ? null
      : typeof cepRaw === 'string'
        ? cepRaw.replace(/\D/g, '') || null
        : null

  if (cidade.length < 2) {
    throw new Error('Geofencing obrigatório: cidade (município) ausente ou curta demais')
  }
  if (estado.length !== 2) {
    throw new Error('Geofencing obrigatório: UF (estado) com 2 letras')
  }
  return { cidade, estado, cep }
}
