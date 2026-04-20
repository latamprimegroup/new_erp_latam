import { NextResponse } from 'next/server'
import { VaultIndustrialUnitStatus, VaultGmailStatus } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { decrypt } from '@/lib/encryption'
import { prisma } from '@/lib/prisma'
import { CNPJ_SITUACAO_ATIVA_RE, fetchCnpjBrasilApiNoStore } from '@/lib/receita-federal'
import { createIndustrialProfile } from '@/lib/geo-provision/adspower-industrial'
import { matchGeoProxy } from '@/lib/geo-provision/proxy-matcher'
import { decryptVaultCookieForAdsPower, runIdentitySyncPipeline } from '@/lib/geo-provision/identity-sync'

const ADS_POWER_THROTTLE_MS = 1100

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function extractDddFromBrasilTelefone(cnpjDigits: string): Promise<string | null> {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`, { cache: 'no-store' })
    if (!res.ok) return null
    const j = (await res.json()) as { telefone?: string }
    const t = String(j.telefone || '').replace(/\D/g, '')
    if (t.length >= 10) return t.slice(0, 2)
  } catch {
    /* ignore */
  }
  return null
}

/**
 * POST — Esteira Geo-Provision: UNI → AdsPower + proxy geo + (opcional) Playwright.
 */
export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: {
    inventoryGmailId?: string
    inventoryCnpjId?: string
    identityInventoryId?: string | null
    partnerLegalName?: string | null
    partnerBirthDate?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const gmailId = typeof body.inventoryGmailId === 'string' ? body.inventoryGmailId.trim() : ''
  const cnpjId = typeof body.inventoryCnpjId === 'string' ? body.inventoryCnpjId.trim() : ''
  const identityId =
    typeof body.identityInventoryId === 'string' && body.identityInventoryId.trim()
      ? body.identityInventoryId.trim()
      : null

  if (!gmailId || !cnpjId) {
    return NextResponse.json({ error: 'inventoryGmailId e inventoryCnpjId obrigatórios' }, { status: 400 })
  }

  const pipelineLog: string[] = []

  const gmail = await prisma.inventoryGmail.findUnique({ where: { id: gmailId } })
  const cnpjRow = await prisma.inventoryCnpj.findUnique({ where: { id: cnpjId } })
  if (!gmail || !cnpjRow) {
    return NextResponse.json({ error: 'Registro do cofre não encontrado' }, { status: 404 })
  }

  if (gmail.status !== VaultGmailStatus.AVAILABLE) {
    return NextResponse.json({ error: 'Gmail do cofre não está AVAILABLE' }, { status: 409 })
  }

  let identity = null as Awaited<ReturnType<typeof prisma.inventoryId.findUnique>>
  if (identityId) {
    identity = await prisma.inventoryId.findUnique({ where: { id: identityId } })
    if (!identity) {
      return NextResponse.json({ error: 'Identidade (inventory_id) não encontrada' }, { status: 404 })
    }
  }

  const passwordPlain = decrypt(gmail.passwordEnc)
  if (!passwordPlain) {
    return NextResponse.json(
      { error: 'Não foi possível ler a senha Gmail (ENCRYPTION_KEY / formato).' },
      { status: 500 }
    )
  }

  const normalized = await fetchCnpjBrasilApiNoStore(cnpjRow.cnpj)
  if (!normalized) {
    return NextResponse.json({ error: 'CNPJ não resolvido na Brasil API' }, { status: 422 })
  }
  const situacao = (normalized.situacaoCadastral || '').trim()
  if (!CNPJ_SITUACAO_ATIVA_RE.test(situacao)) {
    return NextResponse.json(
      { error: `CNPJ não está ATIVA na Receita (situação: ${situacao || '?'})` },
      { status: 422 }
    )
  }

  if (identity && (body.partnerLegalName != null || body.partnerBirthDate != null)) {
    await prisma.inventoryId.update({
      where: { id: identity.id },
      data: {
        ...(body.partnerLegalName != null ? { partnerLegalName: body.partnerLegalName || null } : {}),
        ...(body.partnerBirthDate != null
          ? {
              partnerBirthDate: body.partnerBirthDate
                ? new Date(`${body.partnerBirthDate}T12:00:00.000Z`)
                : null,
            }
          : {}),
      },
    })
    identity = await prisma.inventoryId.findUnique({ where: { id: identity.id } })
  }

  const geo = cnpjRow.geofencing as { cidade?: string; estado?: string } | null
  const anchorCity = geo?.cidade || normalized.municipio
  const anchorState = (geo?.estado || normalized.uf || '').toUpperCase().slice(0, 2) || null
  const anchorDdd = await extractDddFromBrasilTelefone(normalized.cnpj)

  const unit = await prisma.vaultIndustrialUnit.create({
    data: {
      inventoryGmailId: gmail.id,
      inventoryCnpjId: cnpjRow.id,
      identityInventoryId: identity?.id ?? null,
      status: VaultIndustrialUnitStatus.PROVISIONING,
      anchorCity,
      anchorState,
    },
  })

  const push = (msg: string) => {
    pipelineLog.push(`${new Date().toISOString()} ${msg}`)
  }

  push(`Criando Perfil AdsPower para UNI ${unit.id}…`)

  try {
    const { entry: proxyEntry, geoTransition, matchLevel } = await matchGeoProxy({
      anchorCity,
      anchorStateUf: anchorState,
      anchorDdd,
    })

    push(`Sincronizando proxy de [${proxyEntry.city || proxyEntry.stateUf || 'pool'}] (${matchLevel}${geoTransition ? ', GEO_TRANSITION' : ''})…`)

    const proxyPass = proxyEntry.proxyPasswordEnc ? decrypt(proxyEntry.proxyPasswordEnc) : ''

    const groupId = process.env.ADSPOWER_GROUP_ID?.trim() || '0'
    const twoFa = gmail.twoFaEnc ? decrypt(gmail.twoFaEnc) : null
    const cookieJson = decryptVaultCookieForAdsPower(gmail.sessionCookiesEnc)

    const { profileId } = await createIndustrialProfile({
      profileLabel: `UNI-${unit.id.slice(0, 8)}`,
      email: gmail.email,
      password: passwordPlain,
      twoFaKey: twoFa,
      cookieJson,
      groupId,
      userProxyConfig: {
        proxy_type: 'http',
        proxy_host: proxyEntry.proxyHost,
        proxy_port: proxyEntry.proxyPort,
        proxy_user: proxyEntry.proxyUser || undefined,
        proxy_password: proxyPass || undefined,
        proxy_soft: proxyEntry.proxySoft || 'other',
      },
    })

    push(`Perfil AdsPower criado #${profileId}`)

    await prisma.vaultIndustrialUnit.update({
      where: { id: unit.id },
      data: {
        adsPowerProfileId: profileId,
        matchedProxyId: proxyEntry.id,
        geoTransition,
      },
    })

    await sleep(ADS_POWER_THROTTLE_MS)

    push('Injetando perfil de pagamentos / identidade (conforme automação)…')
    const idLogs = await runIdentitySyncPipeline({
      adsPowerProfileId: profileId,
      partnerLegalName: identity?.partnerLegalName,
      partnerBirthDate: identity?.partnerBirthDate,
      fiscal: normalized,
    })
    for (const line of idLogs.logs) push(line)

    await prisma.vaultIndustrialUnit.update({
      where: { id: unit.id },
      data: {
        status: VaultIndustrialUnitStatus.READY_FOR_WARMUP,
        lastPipelineLogs: pipelineLog,
        provisionError: null,
      },
    })

    await prisma.inventoryGmail.update({
      where: { id: gmail.id },
      data: { status: VaultGmailStatus.IN_USE },
    })

    return NextResponse.json({
      ok: true,
      unitId: unit.id,
      adsPowerProfileId: profileId,
      geoTransition,
      logs: pipelineLog,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha na esteira'
    pipelineLog.push(msg)
    await prisma.vaultIndustrialUnit.update({
      where: { id: unit.id },
      data: {
        status: VaultIndustrialUnitStatus.FAILED,
        provisionError: msg,
        lastPipelineLogs: pipelineLog,
      },
    })
    return NextResponse.json({ ok: false, unitId: unit.id, error: msg, logs: pipelineLog }, { status: 500 })
  }
}
