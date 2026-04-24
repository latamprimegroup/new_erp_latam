/**
 * scripts/zerar-estoque.mjs
 * Apaga TODOS os ativos e movimentos do banco.
 * Executa: node scripts/zerar-estoque.mjs --confirmar
 */
import { PrismaClient } from '@prisma/client'
import { createInterface } from 'readline'

const prisma = new PrismaClient()

async function main() {
  const confirmar = process.argv.includes('--confirmar')

  // Conta o que será apagado
  const [totalAtivos, totalMovimentos, totalRma, totalSalesOrders] = await Promise.all([
    prisma.asset.count(),
    prisma.assetMovement.count(),
    prisma.rMATicket.count(),
    prisma.assetSalesOrder.count(),
  ])

  console.log('\n⚠️  ATENÇÃO — OPERAÇÃO IRREVERSÍVEL')
  console.log('══════════════════════════════════════')
  console.log(`  Ativos:           ${totalAtivos}`)
  console.log(`  Movimentos:       ${totalMovimentos}`)
  console.log(`  RMA Tickets:      ${totalRma}`)
  console.log(`  Ordens de venda:  ${totalSalesOrders}`)
  console.log('══════════════════════════════════════\n')

  if (!confirmar) {
    console.log('Para executar, rode com a flag --confirmar:')
    console.log('  node scripts/zerar-estoque.mjs --confirmar\n')
    await prisma.$disconnect()
    return
  }

  // Pede confirmação adicional via terminal
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  await new Promise((resolve) => {
    rl.question('Digite ZERAR para confirmar: ', (resp) => {
      rl.close()
      if (resp.trim() !== 'ZERAR') {
        console.log('\n❌ Cancelado.')
        process.exit(0)
      }
      resolve()
    })
  })

  console.log('\n🗑️  Apagando...')

  // Ordem correta para respeitar as foreign keys
  const [rma, movements, salesOrderMovements, salesOrders, assets] = await prisma.$transaction([
    prisma.rMATicket.deleteMany(),
    prisma.assetMovement.deleteMany(),
    prisma.assetSalesOrderMovement.deleteMany(),
    prisma.assetSalesOrder.deleteMany(),
    prisma.asset.deleteMany(),
  ])

  console.log('\n✅ Estoque zerado com sucesso!')
  console.log(`   RMA Tickets apagados:        ${rma.count}`)
  console.log(`   Movimentos apagados:          ${movements.count}`)
  console.log(`   Mov. ordens apagados:         ${salesOrderMovements.count}`)
  console.log(`   Ordens de venda apagadas:     ${salesOrders.count}`)
  console.log(`   Ativos apagados:              ${assets.count}`)
  console.log('\n🚀 Banco limpo. Pronto para começar do zero.\n')

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
