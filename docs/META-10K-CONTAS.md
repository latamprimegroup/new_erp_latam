# Meta: 10.000 contas/mês (produção e vendas)

## Raciocínio de negócio

Para atingir **10.000 contas vendidas por mês** e **10.000 contas produzidas por mês**:

### 1. Produção
- **Meta**: 10.000 contas produzidas no mês
- **Cálculo**: soma de `ProductionAccount` criados no mês (`createdAt` no mês atual)
- **Ritmo esperado**: ~333 contas/dia (10.000 ÷ 30 dias)
- **Ritmo necessário**: `(meta - producao_atual) / dias_restantes` — quantas contas/dia faltam para bater a meta

### 2. Vendas
- **Meta**: 10.000 contas vendidas no mês
- **Cálculo**: soma de `OrderItem.quantity` onde `Order.status` in (PAID, IN_SEPARATION, IN_DELIVERY, DELIVERED) e `Order.paidAt` no mês atual
- **Ritmo esperado**: ~333 contas/dia
- **Ritmo necessário**: idem à produção

### 3. Alerta
- Se no dia 15 ou depois a produção ou vendas estiverem abaixo de **80%** do esperado para o período, o sistema emite alerta visual (card em destaque + mensagem).

### 4. Indicadores
- **No ritmo**: produção/vendas atual ≥ 90% do esperado para o dia (ritmo linear ao longo do mês)
- **Abaixo do ritmo**: caso contrário
- **Barra de progresso**: percentual em relação à meta

---

## Funções no sistema

### API: `GET /api/metas-globais`
Retorna:
- `metaProducao`, `metaVendas` — metas configuradas
- `producaoAtual`, `vendasAtual` — números do mês
- `percentualProducao`, `percentualVendas`
- `ritmoProducaoNecessario`, `ritmoVendasNecessario` — contas/dia necessárias
- `noRitmoProducao`, `noRitmoVendas` — booleano se está no ritmo
- `alertaProducao`, `alertaVendas` — booleano se deve alertar

### API: `PATCH /api/metas-globais` (admin)
Atualiza metas: `{ metaProducao: number, metaVendas: number }`

### Lib: `src/lib/metas-globais.ts`
- `getMetasGlobais()` — retorna metas configuradas
- `setMetasGlobais(metaProducao, metaVendas)` — salva metas (admin)
- `calcularMetasMensais()` — calcula progresso, ritmo e alertas
- `initMetasPadrao()` — inicializa 10k/10k se não existir

### UI: `MetasMensaisCard` (Dashboard)
- Cards de produção e vendas com barra de progresso
- Badge "No ritmo" / "Abaixo do ritmo"
- Ritmo necessário em contas/dia
- Admin pode editar metas (botão "Editar metas")

### Configuração
- Modelo `SystemSetting`: chaves `meta_producao_mensal` e `meta_vendas_mensal`
- Valores padrão: 10.000 (seed e `initMetasPadrao`)

---

## Migração e seed

Após alterar o schema:
```bash
npx prisma db push   # ou migrate dev
npx prisma db seed   # opcional, cria metas padrão
```
