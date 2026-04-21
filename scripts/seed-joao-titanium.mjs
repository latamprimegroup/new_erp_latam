/**
 * Seed — Lote João Titanium (21/04/2026)
 * Insere 14 ativos com IDs exclusivos Ads Ativos, cria fornecedor e PurchaseOrder.
 * Executar: node scripts/seed-joao-titanium.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ─── Dados do lote ──────────────────────────────────────────────────────────
const LOTE = [
  {
    adsId:        'AA-G12-HS-001',
    displayName:  'Diamond Real Estate',
    description:  'Conta Google Ads — Imobiliária | Criada em 2012 | Gasto histórico: R$238k | Verificação: OK | Pagamento: Manual',
    category:     'CONTAS',
    subCategory:  'GOOGLE',
    spendBRL:     238_000,
    year:         2012,
    spendClass:   'HS',
    currency:     'BRL',
    faturamento:  'Manual',
    verificacao:  'OK',
    nicho:        'Imobiliária',
    salePrice:    5950,
    tags:         'real-estate,high-spend,diamond,conta-antiga,2fa-verified',
  },
  {
    adsId:        'AA-G14-HS-002',
    displayName:  'Platinum Global Education',
    description:  'Conta Google Ads — Intercâmbio | Criada em 2014 | Gasto histórico: R$184k | Verificação: OK | Pagamento: Manual',
    category:     'CONTAS',
    subCategory:  'GOOGLE',
    spendBRL:     184_000,
    year:         2014,
    spendClass:   'HS',
    currency:     'BRL',
    faturamento:  'Manual',
    verificacao:  'OK',
    nicho:        'Intercâmbio / Educação',
    salePrice:    4600,
    tags:         'education,high-spend,diamond,conta-antiga',
  },
  {
    adsId:        'AA-G09-HS-003',
    displayName:  'Industrial Legacy',
    description:  'Conta Google Ads — Indústria (Arames) | Criada em 2009 | Gasto histórico: R$199k | Verificação: OK | Pagamento: Manual',
    category:     'CONTAS',
    subCategory:  'GOOGLE',
    spendBRL:     199_000,
    year:         2009,
    spendClass:   'HS',
    currency:     'BRL',
    faturamento:  'Manual',
    verificacao:  'OK',
    nicho:        'Indústria / Arames',
    salePrice:    4975,
    tags:         'industrial,high-spend,diamond,vintage,conta-antiga',
  },
  {
    adsId:        'AA-G15-MS-004',
    displayName:  'Health & Care Pro',
    description:  'Conta Google Ads — Saúde (Implante Capilar) | Criada em 2015 | Gasto histórico: R$86.1k | Aquecimento: OK | Pagamento: Manual',
    category:     'CONTAS',
    subCategory:  'GOOGLE',
    spendBRL:     86_100,
    year:         2015,
    spendClass:   'MS',
    currency:     'BRL',
    faturamento:  'Manual',
    verificacao:  'OK',
    aquecimento:  'OK',
    nicho:        'Saúde / Implante Capilar',
    salePrice:    4305,
    tags:         'healthcare,mid-spend,gold',
  },
  {
    adsId:        'AA-G18-MS-005',
    displayName:  'Safety & EPI Solutions',
    description:  'Conta Google Ads — EPI/Segurança | Criada em 2018 | Gasto histórico: R$89.3k | Verificação: OK | Pagamento: Manual',
    category:     'CONTAS',
    subCategory:  'GOOGLE',
    spendBRL:     89_300,
    year:         2018,
    spendClass:   'MS',
    currency:     'BRL',
    faturamento:  'Manual',
    verificacao:  'OK',
    nicho:        'EPI / Segurança do Trabalho',
    salePrice:    4465,
    tags:         'epi,safety,mid-spend,gold',
  },
  {
    adsId:        'AA-G11-MS-006',
    displayName:  'Legal Display Network',
    description:  'Conta Google Ads — Advocacia (Display) | Criada em 2011 | Gasto histórico: R$49.4k | CNPJ | Pagamento: Manual',
    category:     'CONTAS',
    subCategory:  'GOOGLE',
    spendBRL:     49_400,
    year:         2011,
    spendClass:   'MS',
    currency:     'BRL',
    faturamento:  'CNPJ',
    verificacao:  null,
    nicho:        'Advocacia / Jurídico',
    salePrice:    2470,
    tags:         'legal,display,mid-spend,gold,conta-antiga',
  },
  {
    adsId:        'AA-G15-MS-007',
    displayName:  'Retail Footwear',
    description:  'Conta Google Ads — Calçados | Criada em 2015 | Gasto histórico: R$43.6k | Verificação: 15/04 | Pagamento: Manual',
    category:     'CONTAS',
    subCategory:  'GOOGLE',
    spendBRL:     43_600,
    year:         2015,
    spendClass:   'MS',
    currency:     'BRL',
    faturamento:  'Manual',
    verificacao:  '15/04',
    nicho:        'Calçados / Varejo',
    salePrice:    2180,
    tags:         'retail,footwear,mid-spend,gold',
  },
  {
    adsId:        'AA-G24-LS-008',
    displayName:  'Fitness Starter 2024',
    description:  'Conta Google Ads — Academia/Fitness | Criada em 2024 | Gasto total: R$22.6k | Gasto recente: R$6k | Pagamento: Manual',
    category:     'CONTAS',
    subCategory:  'GOOGLE',
    spendBRL:     22_600,
    year:         2024,
    spendClass:   'LS',
    currency:     'BRL',
    faturamento:  'Manual',
    verificacao:  null,
    nicho:        'Fitness / Academia',
    salePrice:    1130,
    tags:         'fitness,gym,low-spend,silver,conta-recente',
  },
  {
    adsId:        'AA-G24-LS-009',
    displayName:  'Service Flow',
    description:  'Conta Google Ads — Serviços Hidráulicos | Criada em 2024 | Gasto total: R$24.8k | Gasto recente: R$1.7k',
    category:     'CONTAS',
    subCategory:  'GOOGLE',
    spendBRL:     24_800,
    year:         2024,
    spendClass:   'LS',
    currency:     'BRL',
    faturamento:  null,
    verificacao:  null,
    nicho:        'Serviços Hidráulicos / Vazamento',
    salePrice:    1240,
    tags:         'services,plumbing,low-spend,silver,conta-recente',
  },
  {
    adsId:        'AA-G17-USD-010',
    displayName:  'Global Dollar Bar',
    description:  'Conta Google Ads USD — Entretenimento/Bar | Criada em 2017 | Gasto: $3.25k USD | CNPJ BR | Pagamento: Automático',
    category:     'CONTAS',
    subCategory:  'GOOGLE',
    spendBRL:     17_875,   // $3.25k * 5.5
    year:         2017,
    spendClass:   'DS',
    currency:     'USD',
    spendUSD:     3_250,
    faturamento:  'CNPJ',
    verificacao:  null,
    pagamento:    'Automático',
    nicho:        'Bar / Entretenimento',
    salePrice:    3800,    // Premium USD
    tags:         'usd,dolar,global,bar,entertainment',
  },
  {
    adsId:        'AA-G18-USD-011',
    displayName:  'Global Dollar Auto',
    description:  'Conta Google Ads USD — Automotivo | Criada em 2018 | Gasto: $1.98k USD | CNPJ BR | Pagamento: Automático',
    category:     'CONTAS',
    subCategory:  'GOOGLE',
    spendBRL:     10_890,  // $1.98k * 5.5
    year:         2018,
    spendClass:   'DS',
    currency:     'USD',
    spendUSD:     1_980,
    faturamento:  'CNPJ',
    verificacao:  null,
    pagamento:    'Automático',
    nicho:        'Automotivo',
    salePrice:    2400,    // Premium USD
    tags:         'usd,dolar,global,automotive',
  },
  {
    adsId:        'AA-G19-LS-012',
    displayName:  'Education Prime',
    description:  'Conta Google Ads — Educação/Colégio | Criada em 2019 | Gasto histórico: R$4.87k | Verificação: OK | Pagamento: Manual',
    category:     'CONTAS',
    subCategory:  'GOOGLE',
    spendBRL:     4_870,
    year:         2019,
    spendClass:   'LS',
    currency:     'BRL',
    faturamento:  'Manual',
    verificacao:  'OK',
    nicho:        'Educação / Colégio',
    salePrice:    487,
    tags:         'education,low-spend,silver',
  },
  {
    adsId:        'AA-G23-LS-013',
    displayName:  'Aesthetics Pro',
    description:  'Conta Google Ads — Estética | Criada em 2023 | Gasto histórico: R$3.42k | Verificação: 14/04 | Pagamento: Manual',
    category:     'CONTAS',
    subCategory:  'GOOGLE',
    spendBRL:     3_420,
    year:         2023,
    spendClass:   'LS',
    currency:     'BRL',
    faturamento:  'Manual',
    verificacao:  '14/04',
    nicho:        'Estética / Beleza',
    salePrice:    342,
    tags:         'aesthetics,beauty,low-spend,silver,conta-recente',
  },
  {
    adsId:        'AA-G25-LS-014',
    displayName:  'Service 2025 New',
    description:  'Conta Google Ads — Serviços | Criada em 2025 | Gasto histórico: R$41.3k | Pagamento: Manual',
    category:     'CONTAS',
    subCategory:  'GOOGLE',
    spendBRL:     41_300,
    year:         2025,
    spendClass:   'LS',
    currency:     'BRL',
    faturamento:  'Manual',
    verificacao:  null,
    nicho:        'Serviços Gerais',
    salePrice:    2065,
    tags:         'services,low-spend,silver,conta-recente',
  },
]

const COST_PER_ASSET = 450   // Custo unitário estimado (ajustar após negociação)
const MARKUP_PCT     = 50    // 50%
const MIN_MARGIN_PCT = 20    // 20% floor

async function main() {
  console.log('🚀 Iniciando seed — Lote João Titanium (21/04/2026)\n')

  // ── 1. Verificar ativos existentes (evita duplicatas) ─────────────────────
  const existingIds = await prisma.asset.findMany({
    where:  { adsId: { in: LOTE.map((a) => a.adsId) } },
    select: { adsId: true },
  })
  const existingSet = new Set(existingIds.map((a) => a.adsId))
  if (existingSet.size > 0) {
    console.log(`⚠️  ${existingSet.size} ativo(s) já existem e serão ignorados:`)
    existingSet.forEach((id) => console.log(`   • ${id}`))
    console.log()
  }

  // ── 2. Upsert do fornecedor João Titanium ─────────────────────────────────
  const vendor = await prisma.vendor.upsert({
    where:  { taxId: 'JOAO-TITANIUM-LOTE-01' },
    create: {
      name:        'João Titanium',
      taxId:       'JOAO-TITANIUM-LOTE-01',
      category:    'CONTAS',
      rating:      8,
      paymentTerms: 'Pagamento manual via pix após confirmação',
      contactInfo: { observacao: 'Fornecedor WhatsApp — Lote inicial 21/04/2026' },
    },
    update: { rating: 8 },
  })
  console.log(`✅ Fornecedor: ${vendor.name} (id: ${vendor.id})\n`)

  // ── 3. Criar PurchaseOrder do lote ────────────────────────────────────────
  const totalLote = COST_PER_ASSET * LOTE.length
  const po = await prisma.purchaseOrder.create({
    data: {
      vendorId:    vendor.id,
      totalAmount: totalLote,
      paidAmount:  0,
      status:      'PENDING',
      notes:       `Lote João Titanium — 21/04/2026 — ${LOTE.length} ativos Google Ads | Custo unitário estimado: R$${COST_PER_ASSET}`,
    },
  })
  console.log(`📋 Ordem de Compra criada: ${po.id} | Total: R$${totalLote.toLocaleString('pt-BR')}\n`)
  console.log('─'.repeat(60))

  // ── 4. Inserir ativos ─────────────────────────────────────────────────────
  let created = 0
  let skipped = 0

  for (const row of LOTE) {
    if (existingSet.has(row.adsId)) { skipped++; continue }

    const costPrice  = COST_PER_ASSET
    const floorPrice = costPrice * (1 + MIN_MARGIN_PCT / 100)

    const specs = {
      platform:   row.subCategory,
      year:       row.year,
      spendBRL:   row.spendBRL,
      spendUSD:   row.spendUSD ?? null,
      currency:   row.currency,
      spendClass: row.spendClass,
      nicho:      row.nicho,
      faturamento: row.faturamento ?? null,
      verificacao: row.verificacao ?? null,
      aquecimento: row.aquecimento ?? null,
      pagamento:   row.pagamento ?? 'Manual',
    }

    const asset = await prisma.asset.create({
      data: {
        adsId:          row.adsId,
        category:       row.category,
        subCategory:    row.subCategory,
        status:         'AVAILABLE',
        vendorId:       vendor.id,
        costPrice,
        floorPrice,
        minMarginPct:   MIN_MARGIN_PCT,
        markupPct:      MARKUP_PCT,
        vendorRef:      'Lote João Titanium 21/04/2026',
        salePrice:      row.salePrice,
        displayName:    row.displayName,
        description:    row.description,
        tags:           row.tags,
        specs,
        purchaseOrderId: po.id,
      },
    })

    await prisma.assetMovement.create({
      data: {
        assetId:  asset.id,
        toStatus: 'AVAILABLE',
        reason:   'Seed — Lote João Titanium 21/04/2026',
      },
    })

    const spendStr = row.currency === 'USD'
      ? `$${(row.spendBRL / 5500).toFixed(2)}k USD`
      : `R$${(row.spendBRL / 1000).toFixed(1)}k`

    console.log(`  ✅ ${row.adsId}  |  ${row.displayName.padEnd(30)} | ${spendStr.padStart(12)} | R$${row.salePrice.toLocaleString('pt-BR')}`)
    created++
  }

  console.log('─'.repeat(60))
  console.log(`\n📦 Resultado:`)
  console.log(`   ✅ Criados:  ${created} ativos`)
  console.log(`   ⏭️  Ignorados: ${skipped} (já existiam)`)
  console.log(`   💰 Receita potencial total: R$${LOTE.reduce((s, a) => s + a.salePrice, 0).toLocaleString('pt-BR')}`)
  console.log(`   📉 Custo total do lote:     R$${totalLote.toLocaleString('pt-BR')}`)
  console.log(`   🟢 Margem bruta estimada:   R$${(LOTE.reduce((s, a) => s + a.salePrice, 0) - totalLote).toLocaleString('pt-BR')}`)
  console.log(`\n⚠️  PO ${po.id} em status PENDING.`)
  console.log(`   Financeiro deve confirmar o pagamento ao João Titanium para liberar o lote.\n`)
}

main()
  .catch((e) => { console.error('❌ Erro:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
