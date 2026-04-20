import * as net from 'node:net'

export async function tcpProbeHostPort(
  host: string,
  port: number,
  timeoutMs = 4000
): Promise<{ ok: boolean; ms: number; error?: string }> {
  const t0 = Date.now()
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let done = false
    const finish = (ok: boolean, error?: string) => {
      if (done) return
      done = true
      try {
        socket.destroy()
      } catch {
        /* ignore */
      }
      resolve({ ok, ms: Date.now() - t0, error })
    }
    const timer = setTimeout(() => finish(false, 'timeout'), timeoutMs)
    socket.once('connect', () => {
      clearTimeout(timer)
      finish(true)
    })
    socket.once('error', (e) => {
      clearTimeout(timer)
      finish(false, e instanceof Error ? e.message : 'erro')
    })
    socket.connect(port, host)
  })
}
