/**
 * Cloudflare Zone + DNS (API v4). Tokens em CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID.
 * @see https://developers.cloudflare.com/api/
 */

const CF = 'https://api.cloudflare.com/client/v4'

type CfResponse<T> = { success: boolean; result: T; errors?: { message: string }[] }

function authHeaders(): HeadersInit {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim()
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN não configurado')
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function cfJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CF}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...init?.headers },
  })
  const json = (await res.json()) as CfResponse<T>
  if (!json.success) {
    const msg = json.errors?.map((e) => e.message).join('; ') || res.statusText
    throw new Error(msg || 'Erro Cloudflare')
  }
  return json.result
}

export type CfZone = { id: string; name: string; status: string }

export async function cfFindZoneByName(domain: string): Promise<CfZone | null> {
  const q = encodeURIComponent(domain)
  const result = await cfJson<CfZone[]>(`/zones?name=${q}`)
  return result[0] ?? null
}

export async function cfCreateZone(domain: string): Promise<CfZone> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const body: Record<string, unknown> = { name: domain, jump_start: true }
  if (accountId) body.account = { id: accountId }
  return await cfJson<CfZone>('/zones', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function cfEnsureZone(domain: string): Promise<CfZone> {
  const existing = await cfFindZoneByName(domain)
  if (existing) return existing
  return cfCreateZone(domain)
}

type DnsRecord = { id: string; type: string; name: string; content: string; proxied?: boolean }

export async function cfListDnsRecords(zoneId: string): Promise<DnsRecord[]> {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim()
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN não configurado')
  const all: DnsRecord[] = []
  let page = 1
  const perPage = 100
  for (;;) {
    const res = await fetch(
      `${CF}/zones/${zoneId}/dns_records?per_page=${perPage}&page=${page}`,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    )
    const json = (await res.json()) as {
      success: boolean
      result: DnsRecord[]
      result_info?: { total_pages?: number }
      errors?: { message: string }[]
    }
    if (!json.success) {
      throw new Error(json.errors?.map((e) => e.message).join('; ') || 'List DNS falhou')
    }
    all.push(...json.result)
    const totalPages = json.result_info?.total_pages ?? 1
    if (page >= totalPages || json.result.length === 0) break
    page++
    if (page > 100) break
  }
  return all
}

export async function cfDeleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
  await cfJson<{ id: string }>(`/zones/${zoneId}/dns_records/${recordId}`, { method: 'DELETE' })
}

/** Remove registros A/AAAA/CNAME no apex que possam conflitar antes de criar o A proxied. */
export async function cfCleanConflictingRootRecords(zoneId: string, apexName: string): Promise<number> {
  const records = await cfListDnsRecords(zoneId)
  let deleted = 0
  for (const r of records) {
    const n = r.name.toLowerCase()
    const isRoot = n === apexName.toLowerCase()
    if (!isRoot) continue
    if (['A', 'AAAA', 'CNAME'].includes(r.type)) {
      await cfDeleteDnsRecord(zoneId, r.id)
      deleted++
    }
  }
  return deleted
}

export async function cfCreateARecord(
  zoneId: string,
  domain: string,
  serverIp: string,
  proxied: boolean
): Promise<DnsRecord> {
  return await cfJson<DnsRecord>(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'A',
      name: domain,
      content: serverIp,
      ttl: 1,
      proxied,
    }),
  })
}

export async function cfSetSslStrict(zoneId: string): Promise<void> {
  await cfJson<unknown>(`/zones/${zoneId}/settings/ssl`, {
    method: 'PATCH',
    body: JSON.stringify({ value: 'strict' }),
  })
}

export async function cfSetAlwaysHttps(zoneId: string): Promise<void> {
  await cfJson<unknown>(`/zones/${zoneId}/settings/always_use_https`, {
    method: 'PATCH',
    body: JSON.stringify({ value: 'on' }),
  })
}

/** Localiza registro A do apex e alterna proxy (emergência). */
export async function cfSetApexProxy(zoneId: string, domain: string, proxied: boolean): Promise<boolean> {
  const records = await cfListDnsRecords(zoneId)
  const apex = domain.toLowerCase()
  const a = records.find((r) => r.type === 'A' && r.name.toLowerCase() === apex)
  if (!a) return false
  await cfJson<DnsRecord>(`/zones/${zoneId}/dns_records/${a.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ proxied }),
  })
  return true
}

export async function cfDeleteApexARecords(zoneId: string, domain: string): Promise<number> {
  const records = await cfListDnsRecords(zoneId)
  const apex = domain.toLowerCase()
  let n = 0
  for (const r of records) {
    if (r.type === 'A' && r.name.toLowerCase() === apex) {
      await cfDeleteDnsRecord(zoneId, r.id)
      n++
    }
  }
  return n
}
