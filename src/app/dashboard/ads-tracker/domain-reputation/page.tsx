import { DomainReputationClient } from './DomainReputationClient'

export default function DomainReputationPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-white">Módulo 13 — Reputação de domínio (Safe Browsing)</h1>
      <DomainReputationClient />
    </div>
  )
}
