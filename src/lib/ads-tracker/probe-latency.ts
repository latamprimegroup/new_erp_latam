/** Mede tempo de resposta (ms) ao pedir o destino — métrica operacional de borda, não “Quality Score”. */
export async function probeLandingLatencyMs(landingUrl: string): Promise<number | null> {
  const url = landingUrl.trim()
  if (!url) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  const started = Date.now()
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { Accept: '*/*', 'User-Agent': 'AdsAtivosTrackerLatencyProbe/1.0' },
    })
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: 'GET',
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { Accept: 'text/html,*/*;q=0.8', 'User-Agent': 'AdsAtivosTrackerLatencyProbe/1.0' },
      })
    }
    void res.body?.cancel?.()
    return Date.now() - started
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
