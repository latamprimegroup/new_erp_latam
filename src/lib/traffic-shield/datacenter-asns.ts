/**
 * ASNs frequentemente associados a datacenters (referência para o edge combater abuso/automação).
 * Lista reduzida — expandir no edge conforme necessidade operacional.
 */
export const DATACENTER_ASN_HINTS: number[] = [
  15169, 36384, 396982, 139070, // Google / GCP
  14618, 16509, // Amazon / AWS
  8075, // Microsoft
  32934,
]

export function uniqueAsns(list: number[]): number[] {
  return [...new Set(list.filter((n) => Number.isFinite(n) && n > 0))]
}
