'use client'

import { useEffect, useMemo, useState } from 'react'

type Props = { email: string; role: string }

export function IpWatermark({ email, role }: Props) {
  const [ip, setIp] = useState('coletando-ip...')
  useEffect(() => {
    fetch('/api/session/ip')
      .then((r) => r.json())
      .then((d) => setIp(d.ip || 'ip-indisponivel'))
      .catch(() => setIp('ip-indisponivel'))
  }, [])

  const stamp = useMemo(() => `${email} | ${ip} | ${role}`, [email, ip, role])

  return (
    <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden opacity-20">
      <div className="absolute -inset-20 rotate-[-20deg] grid grid-cols-3 gap-8 text-xs font-mono text-violet-300/70">
        {Array.from({ length: 36 }).map((_, i) => (
          <span key={i}>{stamp}</span>
        ))}
      </div>
    </div>
  )
}
