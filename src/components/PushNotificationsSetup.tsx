'use client'

import { useState, useEffect } from 'react'

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function PushNotificationsSetup() {
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [pref, setPref] = useState<boolean>(true)

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        !!VAPID_PUBLIC
    )
  }, [])

  async function subscribe() {
    if (!supported || !VAPID_PUBLIC) {
      setMessage('Push não disponível. Configure VAPID no .env e use HTTPS.')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      })
      const subscription = sub.toJSON()
      const res = await fetch('/api/notifications/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSubscribed(true)
        setMessage('Notificações ativadas no seu dispositivo!')
      } else {
        setMessage(data.error || 'Erro ao ativar')
      }
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : 'Erro. No iPhone: adicione o ERP à tela inicial (PWA) e use iOS 16.4+.'
      )
    }
    setLoading(false)
  }

  async function sendTest() {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/notifications/push/test', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setMessage('Notificação de teste enviada!')
      } else {
        setMessage(data.message || 'Erro. Ative as notificações primeiro.')
      }
    } catch {
      setMessage('Erro ao enviar teste')
    }
    setLoading(false)
  }

  async function togglePref(checked: boolean) {
    setPref(checked)
    try {
      await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyPush: checked }),
      })
    } catch {
      setMessage('Erro ao salvar preferência')
    }
  }

  if (!supported && VAPID_PUBLIC) return null

  return (
    <div className="card">
      <h2 className="font-semibold text-slate-800 mb-2">
        📱 Notificações no iPhone
      </h2>
      <p className="text-sm text-slate-600 mb-4">
        Receba no celular: conta em análise, conta aprovada, conta no estoque (Google Ads, Meta Ads, Kwai), vendas e relatório diário (vendas + produção + meta).
      </p>

      {message && (
        <div className="mb-4 p-3 rounded-lg bg-slate-100 text-slate-700 text-sm">
          {message}
        </div>
      )}

      <div className="space-y-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={pref}
            onChange={(e) => togglePref(e.target.checked)}
            className="rounded border-gray-300 text-primary-600"
          />
          <span className="text-sm">Receber notificações push</span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={subscribe}
            disabled={loading}
            className="btn-primary text-sm py-2"
          >
            {loading ? '...' : subscribed ? '✓ Ativado' : 'Ativar no celular'}
          </button>
          <button
            onClick={sendTest}
            disabled={loading}
            className="btn-secondary text-sm py-2"
          >
            Enviar teste
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500 mt-4">
        iPhone: adicione o ERP à tela inicial (compartilhar → Adicionar à Tela de Início) e use iOS 16.4+.
      </p>
    </div>
  )
}
