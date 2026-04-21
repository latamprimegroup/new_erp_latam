/**
 * Atualiza o cadastro do fornecedor João Titanium com dados oficiais da Receita Federal.
 * Executar: node scripts/update-joao-titanium.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DADOS_OFICIAIS = {
  // ── Dados Jurídicos ──────────────────────────────────────────────────────
  name:        'Titanium Mercado Digital LTDA',
  taxId:       '54.424.637/0001-34',
  category:    'CONTAS',
  rating:      9,   // Tier 1 — parceiro recorrente com CNPJ ativo
  paymentTerms: 'PIX | Simples Nacional — sem retenção de IR/PIS/COFINS na fonte',

  contactInfo: {
    // ── Identidade ─────────────────────────────────────────────────────────
    nomeFantasia:   'Grupo Titanium',
    razaoSocial:    'Titanium Mercado Digital LTDA',
    cnpj:           '54.424.637/0001-34',
    cnpjAtivo:      true,
    cnpjStatus:     'ATIVA',
    cnpjValidado:   true,

    // ── Dados de Contato ───────────────────────────────────────────────────
    whatsapp:       '+55 14 98207-0849',
    sede:           'Rua Gustavo Maciel, 2240, Jd. Nasralla, Bauru/SP',
    cep:            '17012-110',
    municipio:      'Bauru/SP',

    // ── Dados Fiscais ──────────────────────────────────────────────────────
    cnae:           '73.19-0-99',
    cnaeDescricao:  'Outras atividades de publicidade',
    regimeTributario: 'Simples Nacional',
    retencaoImpostos: false,   // Simples Nacional — não reter PIS/COFINS/CSLL
    capitalSocial:  20000.00,
    dataAbertura:   '2024-03-21',

    // ── Quadro Societário ──────────────────────────────────────────────────
    socios: [
      { nome: 'Joao Vitor Goncalves Claro',       qualificacao: 'Sócio-Administrador' },
      { nome: 'Leonardo Augusto Manhanini Garcia', qualificacao: 'Sócio-Administrador' },
    ],

    // ── Classificação Interna ──────────────────────────────────────────────
    tier:           'TIER_1',
    tierMotivo:     'CNPJ ativo, CNAE alinhado (publicidade), recorrência confirmada, 2+ anos de operação',
    limiteConfianca: 'Alto',
    ultimaValidacao: new Date().toISOString(),
    validadoPor:    'Admin ERP — dados Receita Federal via Cursor IA',
    observacoes:    'Optante pelo Simples Nacional. CNAE 7319099 compatível com intermediação de ativos digitais e emissão de NF de publicidade.',
  },

  notes: `TIER 1 — Parceiro Estratégico
CNPJ: 54.424.637/0001-34 | Simples Nacional | CNAE: 7319099
Sócios: Joao Vitor Goncalves Claro + Leonardo Augusto Manhanini Garcia
Sede: Bauru/SP | WA: +55 14 98207-0849
Lote inicial: 14 ativos Google Ads lançados em 21/04/2026`,
}

async function main() {
  console.log('🏢 Atualizando cadastro: Titanium Mercado Digital LTDA\n')

  // ── 1. Localiza o fornecedor pelo nome (seed anterior) ──────────────────
  const vendor = await prisma.vendor.findFirst({
    where: { name: { contains: 'João Titanium' } },
    include: { assets: { select: { id: true, adsId: true, status: true } } },
  })

  if (!vendor) {
    console.error('❌ Fornecedor "João Titanium" não encontrado no banco.')
    console.log('   Execute primeiro: node scripts/seed-joao-titanium.mjs')
    process.exit(1)
  }

  console.log(`✅ Fornecedor localizado: "${vendor.name}" (id: ${vendor.id})`)
  console.log(`   Ativos vinculados: ${vendor.assets.length}\n`)

  // ── 2. Atualiza com dados oficiais ──────────────────────────────────────
  const updated = await prisma.vendor.update({
    where: { id: vendor.id },
    data: {
      name:         DADOS_OFICIAIS.name,
      taxId:        DADOS_OFICIAIS.taxId,
      category:     DADOS_OFICIAIS.category,
      rating:       DADOS_OFICIAIS.rating,
      paymentTerms: DADOS_OFICIAIS.paymentTerms,
      contactInfo:  DADOS_OFICIAIS.contactInfo,
      notes:        DADOS_OFICIAIS.notes,
      active:       true,
    },
  })

  console.log('📋 Dados Atualizados:')
  console.log(`   Razão Social:  ${updated.name}`)
  console.log(`   CNPJ:          ${updated.taxId}`)
  console.log(`   Regime:        Simples Nacional — sem retenção na fonte`)
  console.log(`   Tier:          TIER 1 (Rating: ${updated.rating}/10)`)
  console.log(`   CNAE:          73.19-0-99 — Outras atividades de publicidade`)
  console.log(`   Sede:          Bauru/SP`)
  console.log(`   Sócios:        Joao Vitor Goncalves Claro | Leonardo Augusto Manhanini Garcia\n`)

  // ── 3. Verifica e lista todos os ativos vinculados ──────────────────────
  const assets = await prisma.asset.findMany({
    where:   { vendorId: vendor.id },
    orderBy: { adsId: 'asc' },
    select:  { id: true, adsId: true, displayName: true, status: true, salePrice: true },
  })

  console.log(`📦 ${assets.length} Ativos Vinculados ao CNPJ ${updated.taxId}:`)
  console.log('─'.repeat(72))
  let totalReceita = 0
  for (const a of assets) {
    const preco = Number(a.salePrice)
    totalReceita += preco
    console.log(`   ${a.adsId.padEnd(18)} | ${a.displayName.padEnd(35)} | R$${preco.toLocaleString('pt-BR').padStart(8)} | ${a.status}`)
  }
  console.log('─'.repeat(72))
  console.log(`   Receita potencial total: R$${totalReceita.toLocaleString('pt-BR')}\n`)

  // ── 4. Verifica a Purchase Order do lote ───────────────────────────────
  const po = await prisma.purchaseOrder.findFirst({
    where:   { vendorId: vendor.id },
    orderBy: { createdAt: 'desc' },
  })

  if (po) {
    console.log(`📋 Ordem de Compra: ${po.id}`)
    console.log(`   Status:  ${po.status === 'PENDING' ? '⚠️  PENDING — aguardando confirmação de pagamento' : po.status}`)
    console.log(`   Total:   R$${Number(po.totalAmount).toLocaleString('pt-BR')}`)
    console.log(`   Pago:    R$${Number(po.paidAmount).toLocaleString('pt-BR')}`)
    console.log(``)
    console.log(`   ⚡ Ação necessária: Financeiro deve confirmar o pagamento ao`)
    console.log(`      Titanium Mercado Digital LTDA — CNPJ 54.424.637/0001-34`)
    console.log(`      PIX/TED para conta da empresa (Simples Nacional)`)
  }

  // ── 5. Audit Log ─────────────────────────────────────────────────────────
  await prisma.auditLog.create({
    data: {
      action:   'vendor_data_update_oficial',
      entity:   'Vendor',
      entityId: vendor.id,
      details: {
        razaoSocial: DADOS_OFICIAIS.name,
        cnpj:        DADOS_OFICIAIS.taxId,
        tier:        'TIER_1',
        source:      'Receita Federal — dados validados manualmente pelo CEO',
        timestamp:   new Date().toISOString(),
      },
    },
  })

  console.log(`\n✅ AuditLog registrado.`)
  console.log(`\n🏆 Titanium Mercado Digital LTDA agora está classificado como TIER 1`)
  console.log(`   no setor de Compras do ERP Ads Ativos.\n`)
}

main()
  .catch((e) => { console.error('❌ Erro:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
