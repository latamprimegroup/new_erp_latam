/**
 * GET - Dashboards inteligentes por setor
 * ?setor=producao|estoque|vendas|entregas|financeiro
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE', 'COMMERCIAL', 'DELIVERER'])
  if (!auth.ok) return auth.response

  const setor = req.nextUrl.searchParams.get('setor') || 'producao'
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfWeek = new Date(now)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  if (setor === 'producao') {
    const refDate = new Date(now)
    refDate.setHours(0, 0, 0, 0)
    const [snap, g2Group, metaSetting, operatorScores, alertas, pendentes, evolucaoDiariaRaw] = await Promise.all([
      prisma.productionMetricsSnapshot.findFirst({
        where: { referenceDate: { lte: now }, producerId: null },
        orderBy: { referenceDate: 'desc' },
      }),
      prisma.productionG2.groupBy({
        by: ['creatorId'],
        where: {
          deletedAt: null,
          status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
          validatedAt: { not: null, gte: startOfMonth },
        },
        _count: { id: true },
      }),
      prisma.systemSetting.findUnique({ where: { key: 'producao_meta_mensal' } }),
      prisma.operatorScore.findMany({
        where: { referenceDate: refDate, setor: 'PRODUCAO' },
        orderBy: { rankingMes: 'asc' },
        take: 10,
        include: { user: { select: { name: true } } },
      }),
      prisma.strategicAlert.findMany({ where: { resolvedAt: null }, take: 10 }),
      prisma.productionG2.count({
        where: { deletedAt: null, status: { in: ['PARA_CRIACAO', 'EM_CRIACAO', 'AGUARDANDO_APROVACAO'] } },
      }),
      prisma.productionG2.findMany({
        where: {
          deletedAt: null,
          status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
          validatedAt: { not: null, gte: startOfMonth },
        },
        select: { validatedAt: true },
      }),
    ])
    const creatorIds = g2Group.map((g) => g.creatorId)
    const users = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true },
    })
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]))
    const meta = metaSetting ? parseInt(metaSetting.value, 10) : 330
    const producaoMes = snap?.producaoMes ?? 0
    const diasNoMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const diasDecorridos = now.getDate()
    const producaoEsperada = Math.floor((meta / diasNoMes) * diasDecorridos)
    const projecaoFechamento = diasDecorridos > 0 ? Math.round((producaoMes / diasDecorridos) * diasNoMes) : 0
    const indicadorRisco = producaoMes < producaoEsperada * 0.8
    const sorted = [...g2Group].sort((a, b) => b._count.id - a._count.id).slice(0, 10)
    const porDia = new Map<string, number>()
    for (const g of evolucaoDiariaRaw) {
      const d = g.validatedAt!.toISOString().slice(0, 10)
      porDia.set(d, (porDia.get(d) ?? 0) + 1)
    }
    const evolucaoDiaria = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([data, count]) => ({ data, count }))
    const reprovacaoPorMotivo = await prisma.productionG2.groupBy({
      by: ['rejectedReason'],
      where: { deletedAt: null, status: 'REPROVADA', rejectedAt: { gte: startOfMonth } },
      _count: { id: true },
    })
    return NextResponse.json({
      setor: 'producao',
      producaoDia: snap?.producaoDia ?? 0,
      producaoSemana: snap?.producaoSemana ?? 0,
      producaoMes,
      metaMensal: meta,
      projecaoFechamento,
      taxaAprovacao: snap ? Number(snap.taxaAprovacao) : 0,
      taxaReprovacaoPorMotivo: reprovacaoPorMotivo.map((r) => ({ motivo: r.rejectedReason ?? 'N/A', count: r._count.id })),
      tempoMedioConta: snap?.tempoMedioConta ?? 0,
      indicadorRisco,
      scoreQualidade: snap?.scoreQualidade ?? 0,
      ranking: sorted.map((r, i) => ({
        rank: i + 1,
        name: userMap[r.creatorId] ?? null,
        count: r._count.id,
      })),
      rankingOperador: operatorScores.slice(0, 10).map((o, i) => ({
        rank: i + 1,
        name: o.user.name,
        scoreGeral: o.scoreGeral,
        scoreProdutividade: o.scoreProdutividade,
        scoreQualidade: o.scoreQualidade,
      })),
      alertasAtivos: alertas.map((a) => ({ type: a.type, severity: a.severity, message: a.message })),
      contasPendentesRevisao: pendentes,
      evolucaoDiaria,
    })
  }

  if (setor === 'estoque') {
    const [byStatus, byPlatform, disponivel, contas, vendasMedias, stockMin] = await Promise.all([
      prisma.stockAccount.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      prisma.stockAccount.groupBy({
        by: ['platform'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      prisma.stockAccount.count({ where: { deletedAt: null, status: 'AVAILABLE' } }),
      prisma.stockAccount.findMany({
        where: { deletedAt: null, status: 'AVAILABLE' },
        select: { createdAt: true },
      }),
      prisma.order.findMany({
        where: { status: 'DELIVERED', paidAt: { not: null, gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
        select: { items: { select: { quantity: true } } },
      }),
      prisma.systemSetting.findUnique({ where: { key: 'estoque_minimo' } }),
    ])
    const idadeDias = contas.map((c) => Math.floor((now.getTime() - c.createdAt.getTime()) / (24 * 60 * 60 * 1000)))
    const idadeMedia = idadeDias.length > 0 ? Math.round(idadeDias.reduce((a, b) => a + b, 0) / idadeDias.length) : 0
    const contasParadasAcima30 = idadeDias.filter((d) => d > 30).length
    const qtdVendida30d = vendasMedias.reduce((s, o) => s + o.items.reduce((si, i) => si + i.quantity, 0), 0)
    const vendaDiariaMedia = qtdVendida30d / 30
    const diasCobertura = vendaDiariaMedia > 0 ? Math.floor(disponivel / vendaDiariaMedia) : 999
    const minSetting = stockMin ? parseInt(stockMin.value, 10) : 50
    return NextResponse.json({
      setor: 'estoque',
      totalPorTipo: Object.fromEntries(byStatus.map((s) => [s.status, s._count.id])),
      totalPorPlataforma: Object.fromEntries(byPlatform.map((p) => [p.platform, p._count.id])),
      disponivel,
      idadeMediaDias: idadeMedia,
      contasParadasAcima30Dias: contasParadasAcima30,
      diasCobertura,
      previsaoFalta: vendaDiariaMedia > 0 && diasCobertura < 7,
      estoqueMinimo: minSetting,
    })
  }

  if (setor === 'vendas') {
    const [ordersMonth, ordersDelivered, ordersDay, sellerScores, goals] = await Promise.all([
      prisma.order.findMany({
        where: { status: 'DELIVERED', paidAt: { not: null, gte: startOfMonth } },
        select: { value: true, sellerId: true, accountType: true, clientId: true },
      }),
      prisma.order.findMany({
        where: { status: 'DELIVERED', paidAt: { not: null } },
        select: { value: true },
      }),
      prisma.order.findMany({
        where: {
          status: 'DELIVERED',
          paidAt: { not: null, gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
        },
        select: { value: true },
      }),
      prisma.sellerCommercialScore.findMany({
        where: { referenceDate: { lte: now } },
        orderBy: { referenceDate: 'desc' },
        take: 50,
      }),
      prisma.goal.findMany({
        where: { status: 'active', periodStart: { lte: now }, periodEnd: { gte: now } },
        select: { userId: true, monthlyTarget: true },
      }),
    ])
    const receitaMes = ordersMonth.reduce((s, o) => s + Number(o.value), 0)
    const receitaDia = ordersDay.reduce((s, o) => s + Number(o.value), 0)
    const receitaTotal = ordersDelivered.reduce((s, o) => s + Number(o.value), 0)
    const bySeller = new Map<string, number>()
    const porTipoConta = new Map<string, number>()
    const porCliente = new Map<string, number>()
    for (const o of ordersMonth) {
      const id = o.sellerId ?? 'sem-vendedor'
      bySeller.set(id, (bySeller.get(id) ?? 0) + Number(o.value))
      const tipo = o.accountType ?? 'N/A'
      porTipoConta.set(tipo, (porTipoConta.get(tipo) ?? 0) + Number(o.value))
      const cid = o.clientId ?? 'N/A'
      porCliente.set(cid, (porCliente.get(cid) ?? 0) + Number(o.value))
    }
    const ranking = [...bySeller.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    const metaVendas = goals.reduce((s, g) => s + (g.monthlyTarget ?? 0), 0)
    const projecaoMeta = ordersMonth.length > 0 ? receitaMes * 1.02 : 0
    return NextResponse.json({
      setor: 'vendas',
      vendasDia: receitaDia,
      vendasMes: receitaMes,
      receitaTotal,
      ticketMedio: ordersMonth.length > 0 ? receitaMes / ordersMonth.length : 0,
      receitaPorTipoConta: Object.fromEntries(porTipoConta),
      receitaPorCliente: Object.fromEntries([...porCliente.entries()].slice(0, 20)),
      metaIndividual: metaVendas,
      projecaoMeta,
      ranking: ranking.map(([id, val]) => ({ sellerId: id, valor: val })),
      sellerScores: sellerScores.slice(0, 10).map((s) => ({ sellerId: s.sellerId, score: s.scoreTotal })),
    })
  }

  if (setor === 'entregas') {
    const [delays, groups, repositions, emAndamento, concluidas] = await Promise.all([
      prisma.deliveryGroup.count({ where: { status: 'ATRASADA' } }),
      prisma.deliveryGroup.findMany({
        where: { status: { in: ['EM_ANDAMENTO', 'AGUARDANDO_INICIO', 'PARCIALMENTE_ENTREGUE'] } },
        select: { id: true, quantityContracted: true, quantityDelivered: true, clientId: true, expectedCompletionAt: true, groupCreatedAt: true },
      }),
      prisma.deliveryReposition.groupBy({
        by: ['deliveryId'],
        where: { status: { in: ['SOLICITADA', 'APROVADA', 'CONCLUIDA'] } },
        _count: { id: true },
      }),
      prisma.deliveryGroup.findMany({
        where: { status: { in: ['EM_ANDAMENTO', 'PARCIALMENTE_ENTREGUE'] } },
        select: { id: true, groupCreatedAt: true, completedAt: true, clientId: true },
      }),
      prisma.deliveryGroup.findMany({
        where: { status: 'FINALIZADA', completedAt: { not: null, gte: startOfMonth } },
        select: { groupCreatedAt: true, completedAt: true },
      }),
    ])
    const deliveryToClient = new Map<string, string>()
    for (const g of groups) deliveryToClient.set(g.id, g.clientId)
    const repoPorCliente = new Map<string, number>()
    for (const r of repositions) {
      const c = deliveryToClient.get(r.deliveryId)
      if (c) repoPorCliente.set(c, (repoPorCliente.get(c) ?? 0) + r._count.id)
    }
    const percentualConclusao = groups.length > 0
      ? groups.reduce((s, g) => s + (g.quantityContracted > 0 ? (g.quantityDelivered / g.quantityContracted) * 100 : 0), 0) / groups.length
      : 0
    const temposEntrega = concluidas
      .filter((c) => c.completedAt && c.groupCreatedAt)
      .map((c) => (c.completedAt!.getTime() - c.groupCreatedAt.getTime()) / (24 * 60 * 60 * 1000))
    const tempoMedioEntrega = temposEntrega.length > 0 ? Math.round(temposEntrega.reduce((a, b) => a + b, 0) / temposEntrega.length) : 0
    const barraPorEntrega = groups.slice(0, 20).map((g) => ({
      id: g.id,
      progresso: g.quantityContracted > 0 ? Math.round((g.quantityDelivered / g.quantityContracted) * 100) : 0,
    }))
    return NextResponse.json({
      setor: 'entregas',
      entregasAtrasadas: delays,
      entregasEmAndamento: groups.length,
      percentualMedioConclusao: Math.round(percentualConclusao),
      tempoMedioEntregaDias: tempoMedioEntrega,
      reposicoesPendentes: repositions.length,
      indiceReposicaoPorCliente: Object.fromEntries([...repoPorCliente.entries()].slice(0, 20)),
      barraProgressoPorEntrega: barraPorEntrega,
    })
  }

  if (setor === 'financeiro') {
    const [receitas, despesas, pendentes, saques] = await Promise.all([
      prisma.financialEntry.findMany({
        where: { type: 'INCOME', date: { gte: startOfMonth, lte: now } },
        select: { value: true, category: true },
      }),
      prisma.financialEntry.findMany({
        where: { type: 'EXPENSE', date: { gte: startOfMonth, lte: now } },
        select: { value: true, category: true, costCenter: true },
      }),
      prisma.order.findMany({
        where: { status: 'DELIVERED', paidAt: null },
        select: { value: true },
      }),
      prisma.withdrawal.findMany({
        where: { status: 'PENDING' },
        select: { id: true, amount: true },
      }),
    ])
    const receitaMes = receitas.reduce((s, r) => s + Number(r.value), 0)
    const despesaMes = despesas.reduce((s, d) => s + Number(d.value), 0)
    const lucroLiquido = receitaMes - despesaMes
    const margemPct = receitaMes > 0 ? (lucroLiquido / receitaMes) * 100 : 0
    const recebimentosPendentes = pendentes.reduce((s, o) => s + Number(o.value), 0)
    const saquesPendentes = saques.reduce((s, w) => s + Number(w.amount), 0)
    const custosPorSetor = new Map<string, number>()
    for (const d of despesas) {
      const setor = d.costCenter ?? d.category ?? 'OUTROS'
      custosPorSetor.set(setor, (custosPorSetor.get(setor) ?? 0) + Number(d.value))
    }
    return NextResponse.json({
      setor: 'financeiro',
      receitaMes,
      despesas: despesaMes,
      lucroLiquido,
      margemPercentual: Math.round(margemPct * 10) / 10,
      fluxoCaixaAtual: receitaMes - despesaMes,
      recebimentosPendentes,
      saquesPendentes,
      custosPorSetor: Object.fromEntries(custosPorSetor),
    })
  }

  return NextResponse.json({ error: 'Setor inválido' }, { status: 400 })
}
