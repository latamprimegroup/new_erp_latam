import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { maskCnpj, maskEmail } from '@/lib/gatekeeper/masking'
import { CNPJ_SITUACAO_ATIVA_RE } from '@/lib/receita-federal'
import type { VaultIdDocRef } from '@/lib/gatekeeper/types'

function daysSince(iso: Date): number {
  return Math.floor((Date.now() - iso.getTime()) / 86_400_000)
}

/**
 * GET — Kit operador: checklist de prontidão operacional + link para documento do cofre (sem automação de “aquecimento”).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  }

  const unit = await prisma.vaultIndustrialUnit.findUnique({
    where: { id },
    include: {
      inventoryGmail: true,
      inventoryCnpj: true,
      identityInventory: true,
      warmupLot: { select: { id: true, name: true, status: true, internalMaturityPct: true } },
      matchedProxy: {
        select: {
          id: true,
          city: true,
          stateUf: true,
          provider: true,
          proxyHost: true,
          proxyPort: true,
        },
      },
    },
  })

  if (!unit) {
    return NextResponse.json({ error: 'UNI não encontrada' }, { status: 404 })
  }

  const situacao = (unit.inventoryCnpj.situacaoRf || '').trim()
  const cnpjAtivo = CNPJ_SITUACAO_ATIVA_RE.test(situacao)

  const docRefs = Array.isArray(unit.identityInventory?.docUrls)
    ? (unit.identityInventory!.docUrls as unknown as VaultIdDocRef[])
    : []
  const hasScrubbedDoc = docRefs.some((r) => r?.kind === 'scrubbed_id_doc' && r.key)

  const hasSessionCookies = Boolean(unit.inventoryGmail.sessionCookiesEnc?.trim())

  const checklist: { id: string; label: string; ok: boolean; detail?: string }[] = [
    {
      id: 'cnpj_rf',
      label: 'CNPJ no cofre com situação ATIVA (última ingestão)',
      ok: cnpjAtivo,
      detail: cnpjAtivo ? situacao : situacao || '—',
    },
    {
      id: 'adspower_profile',
      label: 'Perfil AdsPower criado (user_id)',
      ok: Boolean(unit.adsPowerProfileId?.trim()),
      detail: unit.adsPowerProfileId || undefined,
    },
    {
      id: 'proxy_matched',
      label: 'Proxy do pool vinculado à UNI',
      ok: Boolean(unit.matchedProxyId),
      detail: unit.matchedProxy
        ? `${unit.matchedProxy.provider} · ${unit.matchedProxy.city || unit.matchedProxy.stateUf || 'pool'}`
        : undefined,
    },
    {
      id: 'identity_linked',
      label: 'Identidade (sócio) vinculada à UNI',
      ok: Boolean(unit.identityInventoryId),
    },
    {
      id: 'scrubbed_document',
      label: 'Documento tratado (EXIF) disponível no cofre',
      ok: hasScrubbedDoc,
      detail: hasScrubbedDoc ? 'Download via API (admin)' : undefined,
    },
    {
      id: 'session_cookies',
      label: 'Cookies de sessão Gmail presentes no cofre (opcional)',
      ok: hasSessionCookies,
      detail: hasSessionCookies ? 'Cifrados em repouso' : 'Não obrigatório para checklist',
    },
    {
      id: 'geo_transition',
      label: 'Protocolo de transição geográfica (se aplicável)',
      ok: !unit.geoTransition,
      detail: unit.geoTransition
        ? 'GEO_TRANSITION: seguir política interna antes de uso pesado'
        : 'Sem flag de transição',
    },
  ]

  const requiredIds = ['cnpj_rf', 'adspower_profile', 'proxy_matched']
  const requiredOk = requiredIds.every((rid) => checklist.find((c) => c.id === rid)?.ok)
  const passed = checklist.filter((c) => c.ok).length
  const readinessPct = Math.round((passed / checklist.length) * 100)

  const docRoute =
    unit.identityInventoryId && hasScrubbedDoc
      ? `/api/admin/gatekeeper/ids/${unit.identityInventoryId}/scrubbed-doc`
      : null

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    unit: {
      id: unit.id,
      status: unit.status,
      createdAt: unit.createdAt.toISOString(),
      daysSinceProvisioned: daysSince(unit.createdAt),
      adsPowerProfileId: unit.adsPowerProfileId,
      geoTransition: unit.geoTransition,
      anchorCity: unit.anchorCity,
      anchorState: unit.anchorState,
      gmailMasked: maskEmail(unit.inventoryGmail.email),
      cnpjMasked: maskCnpj(unit.inventoryCnpj.cnpj),
      razaoSocial: unit.inventoryCnpj.razaoSocial,
      nicheLabel:
        (unit.inventoryCnpj.nicheOperatorTag || unit.inventoryCnpj.nicheInferred || '').trim() || null,
      provisionError: unit.provisionError,
      warmupLotId: unit.warmupLotId,
      warmupLot: unit.warmupLot,
    },
    checklist,
    summary: {
      readinessPct,
      requiredOk,
      greenLightOperational: requiredOk,
      note:
        'Green light operacional: itens mínimos (CNPJ ativo, AdsPower, proxy). Demais itens são recomendações internas — não inclui “trust score” de plataformas externas.',
    },
    documentDownloadUrl: docRoute,
  })
}
