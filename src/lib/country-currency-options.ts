/**
 * País + moeda ISO 4217 (lista curada LATAM + principais mercados).
 * Evita dependência npm; alinhado ao pedido de select dinâmico por país.
 */
export type CountryCurrencyOption = {
  countryCode: string
  countryName: string
  currencyCode: string
  currencyName: string
}

const RAW: CountryCurrencyOption[] = [
  { countryCode: 'AR', countryName: 'Argentina', currencyCode: 'ARS', currencyName: 'Peso argentino' },
  { countryCode: 'BO', countryName: 'Bolívia', currencyCode: 'BOB', currencyName: 'Boliviano' },
  { countryCode: 'BR', countryName: 'Brasil', currencyCode: 'BRL', currencyName: 'Real' },
  { countryCode: 'CL', countryName: 'Chile', currencyCode: 'CLP', currencyName: 'Peso chileno' },
  { countryCode: 'CO', countryName: 'Colômbia', currencyCode: 'COP', currencyName: 'Peso colombiano' },
  { countryCode: 'CR', countryName: 'Costa Rica', currencyCode: 'CRC', currencyName: 'Colón' },
  { countryCode: 'DO', countryName: 'Rep. Dominicana', currencyCode: 'DOP', currencyName: 'Peso dominicano' },
  { countryCode: 'EC', countryName: 'Equador', currencyCode: 'USD', currencyName: 'Dólar' },
  { countryCode: 'SV', countryName: 'El Salvador', currencyCode: 'USD', currencyName: 'Dólar' },
  { countryCode: 'GT', countryName: 'Guatemala', currencyCode: 'GTQ', currencyName: 'Quetzal' },
  { countryCode: 'HN', countryName: 'Honduras', currencyCode: 'HNL', currencyName: 'Lempira' },
  { countryCode: 'MX', countryName: 'México', currencyCode: 'MXN', currencyName: 'Peso mexicano' },
  { countryCode: 'NI', countryName: 'Nicarágua', currencyCode: 'NIO', currencyName: 'Córdoba' },
  { countryCode: 'PA', countryName: 'Panamá', currencyCode: 'USD', currencyName: 'Dólar' },
  { countryCode: 'PY', countryName: 'Paraguai', currencyCode: 'PYG', currencyName: 'Guarani' },
  { countryCode: 'PE', countryName: 'Peru', currencyCode: 'PEN', currencyName: 'Sol' },
  { countryCode: 'UY', countryName: 'Uruguai', currencyCode: 'UYU', currencyName: 'Peso uruguaio' },
  { countryCode: 'VE', countryName: 'Venezuela', currencyCode: 'VES', currencyName: 'Bolívar' },
  { countryCode: 'US', countryName: 'Estados Unidos', currencyCode: 'USD', currencyName: 'Dólar' },
  { countryCode: 'CA', countryName: 'Canadá', currencyCode: 'CAD', currencyName: 'Dólar canadense' },
  { countryCode: 'PT', countryName: 'Portugal', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'ES', countryName: 'Espanha', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'DE', countryName: 'Alemanha', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'FR', countryName: 'França', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'IT', countryName: 'Itália', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'GB', countryName: 'Reino Unido', currencyCode: 'GBP', currencyName: 'Libra' },
  { countryCode: 'CH', countryName: 'Suíça', currencyCode: 'CHF', currencyName: 'Franco' },
  { countryCode: 'JP', countryName: 'Japão', currencyCode: 'JPY', currencyName: 'Iene' },
  { countryCode: 'CN', countryName: 'China', currencyCode: 'CNY', currencyName: 'Yuan' },
  { countryCode: 'AU', countryName: 'Austrália', currencyCode: 'AUD', currencyName: 'Dólar australiano' },
  { countryCode: 'NZ', countryName: 'Nova Zelândia', currencyCode: 'NZD', currencyName: 'Dólar neozelandês' },
  { countryCode: 'ZA', countryName: 'África do Sul', currencyCode: 'ZAR', currencyName: 'Rand' },
  { countryCode: 'AE', countryName: 'Emirados Árabes', currencyCode: 'AED', currencyName: 'Dirham' },
  { countryCode: 'ZZ', countryName: 'Outro / global', currencyCode: 'USD', currencyName: 'Dólar (genérico)' },
]

/** Ordenado por nome do país; deduplica códigos de país repetidos (mantém primeiro). */
export const COUNTRY_CURRENCY_OPTIONS: CountryCurrencyOption[] = (() => {
  const seen = new Set<string>()
  const out: CountryCurrencyOption[] = []
  for (const row of RAW.sort((a, b) => a.countryName.localeCompare(b.countryName, 'pt-BR'))) {
    if (seen.has(row.countryCode)) continue
    seen.add(row.countryCode)
    out.push(row)
  }
  return out
})()

export function labelForCurrencySelect(o: CountryCurrencyOption): string {
  return `${o.countryName} — ${o.currencyCode} (${o.currencyName})`
}
