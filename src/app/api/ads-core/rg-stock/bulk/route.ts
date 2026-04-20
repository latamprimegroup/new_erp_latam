import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { audit } from '@/lib/audit'
import { ADS_CORE_MAX_UPLOAD, ADS_CORE_UPLOAD_MIMES } from '@/lib/ads-core-utils'
import { adsCoreUploadObject } from '@/lib/ads-core-document-storage'
import { stripImageMetadataPreserveFormat } from '@/lib/ads-core-strip-image-metadata'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

/** Por requisição (evitar timeout em uploads grandes). Vários envios = lote maior. */
const MAX_PAIRS = 80

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!isGerente(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const formData = await req.formData()
  const frentes = formData.getAll('frente').filter((x): x is File => x instanceof File && x.size > 0)
  const versos = formData.getAll('verso').filter((x): x is File => x instanceof File && x.size > 0)

  if (frentes.length === 0 || frentes.length !== versos.length) {
    return NextResponse.json(
      { error: 'Envie o mesmo número de arquivos em "frente" e "verso" (pareados por ordem).' },
      { status: 400 }
    )
  }
  if (frentes.length > MAX_PAIRS) {
    return NextResponse.json({ error: `Máximo de ${MAX_PAIRS} pares por envio.` }, { status: 400 })
  }

  let created = 0
  const errors: string[] = []

  for (let i = 0; i < frentes.length; i++) {
    const fF = frentes[i]
    const fV = versos[i]
    try {
      if (!ADS_CORE_UPLOAD_MIMES.includes(fF.type as (typeof ADS_CORE_UPLOAD_MIMES)[number])) {
        errors.push(`Par ${i + 1}: frente com tipo não permitido`)
        continue
      }
      if (!ADS_CORE_UPLOAD_MIMES.includes(fV.type as (typeof ADS_CORE_UPLOAD_MIMES)[number])) {
        errors.push(`Par ${i + 1}: verso com tipo não permitido`)
        continue
      }
      if (fF.type === 'application/pdf' || fV.type === 'application/pdf') {
        errors.push(`Par ${i + 1}: use apenas imagens (PDF não suportado no estoque RG)`)
        continue
      }

      const bufF = Buffer.from(await fF.arrayBuffer())
      const bufV = Buffer.from(await fV.arrayBuffer())
      if (bufF.length > ADS_CORE_MAX_UPLOAD || bufV.length > ADS_CORE_MAX_UPLOAD) {
        errors.push(`Par ${i + 1}: arquivo muito grande`)
        continue
      }

      const strippedF = await stripImageMetadataPreserveFormat(bufF)
      const strippedV = await stripImageMetadataPreserveFormat(bufV)

      const idPair = randomUUID()
      const pathF = `ads-core/rg-stock/${idPair}-f.${strippedF.ext}`
      const pathV = `ads-core/rg-stock/${idPair}-v.${strippedV.ext}`

      await adsCoreUploadObject(pathF, strippedF.buffer, strippedF.contentType)
      await adsCoreUploadObject(pathV, strippedV.buffer, strippedV.contentType)

      await prisma.adsCoreRgStock.create({
        data: {
          frentePath: pathF,
          versoPath: pathV,
          status: 'DISPONIVEL',
        },
      })
      created++
    } catch (e) {
      errors.push(`Par ${i + 1}: ${e instanceof Error ? e.message : 'falha no processamento'}`)
    }
  }

  await audit({
    userId: auth.session.user.id,
    action: 'ads_core_rg_stock_bulk_upload',
    entity: 'AdsCoreRgStock',
    details: { created, failed: errors.length, pairs: frentes.length },
  })

  return NextResponse.json({ ok: true, created, failed: errors.length, errors })
}
