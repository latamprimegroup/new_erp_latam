# Melhorias no wireframe — visão sênior

Recomendações para deixar o ERP Ads Ativos mais completo, seguro e profissional, com base nas melhores práticas de produto e engenharia.

---

## 1. Fluxos e regras de negócio

### 1.1 Produção → Estoque → Venda (pipeline)

**Hoje:** Produção e estoque são independentes; não há fluxo formal de “aprovação” que mova conta da produção para o estoque.

**Melhoria no wireframe:**
- Definir **estados da conta**: `Rascunho` → `Em produção` → `Em revisão` → `Aprovada (estoque)` / `Rejeitada`.
- Tela de **aprovação (Admin/Financeiro)**: lista de contas da produção pendentes, com ações “Aprovar (ir para estoque)” e “Rejeitar (com motivo)”.
- Ao aprovar: criar/atualizar registro em **Estoque** e opcionalmente vincular à **Produção** (rastreabilidade).
- Campo **motivo da rejeição** (obrigatório) e exibição para o produtor.

### 1.2 Venda → Pagamento → Entrega (ordem clara)

**Melhoria no wireframe:**
- **Status do pedido** explícitos e sequenciais, por exemplo:  
  `Cotação` → `Pedido criado` → `Aguardando pagamento` → `Pago` → `Em separação` → `Em entrega` → `Entregue` / `Cancelado`.
- Tela **“Pagamento pendente”** para o cliente: valor, chave PIX, QR code (quando houver integração), tempo limite (ex.: 24h).
- **Transição automática** (ou com botão “Confirmar pagamento”) quando o PIX for detectado (integração Banco Inter).
- **Entrega** só permitida para pedidos com status “Pago”; ao marcar “Entregue”, atualizar status do pedido e (se aplicável) das contas vinculadas (reservadas/entregues).

### 1.3 Controle de duplicidade (já citado no wireframe)

**Incluir no wireframe:**
- Na **Produção** e na **Base (E-mails/CNPJs)**: validação antes de salvar:
  - E-mail único no sistema.
  - CNPJ único (normalizado, só números).
  - Perfil de pagamento não repetido para o mesmo CNPJ/conta.
- Mensagens de erro claras: “E-mail já cadastrado na conta X” / “CNPJ já utilizado”.
- Opcional: tela ou seção **“Alertas de duplicidade”** em Admin (últimos 7 dias).

---

## 2. Área do cliente

### 2.1 Carrinho e checkout

**Hoje:** Cliente solicita cotação via WhatsApp; não há carrinho nem fluxo de checkout no sistema.

**Melhoria no wireframe:**
- **Carrinho**: adicionar/remover contas (da pesquisa), ver total, quantidade.
- **Checkout em 1 tela**: resumo do pedido, valor total, aceite de termos, botão “Gerar pedido e pagar com PIX”.
- Após gerar pedido: tela de **pagamento** (PIX + instruções) e, depois, “Meus pedidos” com status.

### 2.2 Minhas compras e notificações

**Incluir no wireframe:**
- Em **Minhas compras**: filtros (status, período), detalhe do pedido (itens, valor, status, data de pagamento e de entrega).
- **Notificações in-app** (sino): “Pedido #X pago”, “Pedido #X entregue”, “Nova conta disponível no seu perfil”.
- Preferência em **Perfil**: “Notificar por e-mail” / “Notificar por WhatsApp” (quando houver integração).

### 2.3 Recuperação de senha

**Incluir no wireframe:**
- Tela **“Esqueci minha senha”**: e-mail → envio de link com token (válido 1h).
- Tela **“Redefinir senha”** (link do e-mail): nova senha + confirmação, depois redirect para login.

---

## 3. Segurança e compliance

### 3.1 Dados sensíveis

**Incluir no wireframe (e na especificação):**
- **Máscara em tela**: senhas de e-mail, chaves, dados de perfil de pagamento nunca em texto puro; exibir só “••••••••” ou últimos 4 dídigitos quando necessário.
- **Criptografia em repouso**: definir que campos são criptografados no banco (ex.: senha de e-mail, dados de gateway). Documentar no wireframe como “dado sensível – criptografado”.
- **Quem acessa o quê**: na tela Base (E-mails/CNPJs/Perfis), definir que Admin pode “ver mascarado” e “desbloquear para copiar” com 2FA ou confirmação, com registro em auditoria.

### 3.2 Auditoria (logs)

**Melhoria no wireframe:**
- Listar **eventos obrigatórios de auditoria**: login (sucesso/falha), alteração de role, criação/edição/exclusão de conta (produção/estoque), aprovação/rejeição, alteração de pedido, liberação de bônus, acesso a dados sensíveis.
- Tela **Admin > Auditoria**: filtros (usuário, data, ação, entidade), exportação CSV/PDF, retenção mínima (ex.: 1 ano).

### 3.3 Autenticação

**Incluir no wireframe:**
- **2FA (TOTP)** para roles Admin e Financeiro (e opcional para Gestor).
- **Política de senha**: mínimo 8 caracteres, 1 número, 1 caractere especial; exibir no cadastro e na “Alterar senha”.
- **Sessão**: tempo de inatividade (ex.: 30 min) com opção “Estender sessão”; “Encerrar outras sessões” no perfil.

---

## 4. Gestor e fornecedores

### 4.1 Cadastro de fornecedores

**Incluir no wireframe:**
- Módulo **Fornecedores** (ou seção em Configurações do Gestor): nome, contato, observações.
- No **Lançar conta**: campo “Fornecedor” (select) e “Preço de compra” (já existe); histórico “Contas compradas do fornecedor X”.

### 4.2 Margem e precificação

**Melhoria no wireframe:**
- **Markup padrão por tipo de conta** (ex.: Google Ads 20%, Meta 25%) configurável por Gestor/Admin.
- Ao lançar conta: preço de compra + markup padrão → **preço de venda sugerido** (editável).
- Exibir **margem líquida** (venda − compra − taxa, se houver) na listagem e no relatório do gestor.

### 4.3 Aprovação de contas do gestor

**Incluir no wireframe:**
- Contas lançadas pelo Gestor com status **“Em análise”** até Admin (ou Comercial) aprovar ou rejeitar.
- Tela **Admin > Contas ofertadas**: lista com ações Aprovar/Rejeitar e motivo.
- Notificação ao Gestor: “Conta X aprovada e disponível no estoque” / “Conta X rejeitada: motivo”.

---

## 5. Financeiro e saques

### 5.1 Conciliação

**Incluir no wireframe:**
- **Conciliação de entradas**: vincular lançamento financeiro a um pedido (já existe orderId); tela “Entradas não conciliadas” (valor, data, origem) e “Vincular a pedido”.
- **Conciliação de saques**: vincular saque a um gateway/conta externa; status “Conferido” quando valor bater com extrato.

### 5.2 Centro de custo e categorias

**Melhoria no wireframe:**
- **Cadastro de categorias** (Admin): nome, tipo (entrada/saída), ativo.
- **Cadastro de centros de custo** (opcional): ex. “Produção”, “Comercial”, “TI”.
- Nos lançamentos e relatórios: filtro e agrupamento por categoria e centro de custo.

### 5.3 Saques e risco

**Incluir no wireframe:**
- Campo **“Motivo do retenção”** quando status = Retido; histórico de alterações de status do saque.
- **Regra de alerta**: ex. “Alertar se saque pendente > 5 dias” ou “Se valor > R$ X”; exibir na dashboard Financeiro.

---

## 6. Metas, bônus e produtividade

### 6.1 Cálculo automático de produção

**Melhoria no wireframe:**
- **Metas**: produção atual = contagem de contas **aprovadas** (que foram para estoque) no período, não só “criadas”.
- Atualização diária (job noturno) ou em tempo real ao aprovar produção; exibir “Produção válida (aprovada)” vs “Produção total (incl. pendentes)”.

### 6.2 Bônus e regras

**Incluir no wireframe:**
- **Regras de bônus**: ex. “Meta mensal 100% → bônus R$ X”; “Meta + 20% → bônus Y”; configurável por Admin.
- **Liberação de bônus**: fluxo “Solicitar liberação” (Produtor) → “Aprovar/Pagar” (Financeiro) com registro de data e valor.
- Histórico de bônus por colaborador (tabela + exportação).

### 6.3 Gamificação (opcional)

**Incluir no wireframe (baixa prioridade):**
- Badges: “Meta batida 3 meses seguidos”, “Top produtor do mês”.
- Ranking (anonimizado ou por nome) com opt-in; exibir na área do Produtor.

---

## 7. Relatórios e KPIs

### 7.1 Relatórios obrigatórios

**Incluir no wireframe:**
- **Produção**: por produtor, por plataforma, por período (dia/mês/ano), comparativo mês anterior.
- **Vendas**: por vendedor, por cliente, por tipo de conta, ticket médio, conversão (cotações → vendas).
- **Financeiro**: DRE simplificado, fluxo de caixa projetado (próximos 30 dias com base em saques e despesas recorrentes).
- **Entregas**: tempo médio por pedido, SLA cumprido vs atrasado, por entregador.

### 7.2 Exportação e agendamento

**Melhoria no wireframe:**
- Exportação **Excel (XLSX)** além de CSV; **PDF** para relatórios gerenciais (layout definido).
- **Relatório agendado** (Admin): ex. “Enviar relatório de vendas semanal por e-mail toda segunda 8h”; configuração de destinatários e período.

---

## 8. Integrações (definir no wireframe)

### 8.1 Pagamento PIX

**Incluir no wireframe:**
- Fluxo: Pedido criado → sistema gera cobrança PIX (Banco Inter ou outro) → cliente paga → **webhook** confirma pagamento → status do pedido atualizado e notificação ao cliente.
- Tela Admin: “Chaves PIX / Contas de recebimento” (cadastro de contas para receber).

### 8.2 Notificações

**Incluir no wireframe:**
- **Canais**: in-app (sino), e-mail, WhatsApp (quando houver API).
- **Eventos**: pedido pago, pedido entregue, conta aprovada/rejeitada, meta batida, estoque crítico, saque liberado/retido.
- Preferências por usuário: “Receber por e-mail” / “Receber por WhatsApp” por tipo de evento.

### 8.3 Airtable / migração

**Definir no wireframe:**
- Se Airtable for **fonte inicial**: sincronização unidirecional (Airtable → ERP) até migração completa; depois somente PostgreSQL.
- Se Airtable for **apenas histórico**: somente leitura para relatórios legados; novas operações só no ERP.

---

## 9. UX e acessibilidade

### 9.1 Navegação e feedback

**Melhoria no wireframe:**
- **Breadcrumb** em telas profundas (ex.: Dashboard > Vendas > Pedido #123).
- **Feedback de ação**: toasts ou mensagens “Registro salvo”, “Erro: [mensagem]”; loading em botões durante submit.
- **Confirmação** em ações destrutivas (excluir, rejeitar) e em liberação de bônus/saque.

### 9.2 Mobile e PWA

**Incluir no wireframe:**
- Principais telas **responsivas** (lista, formulário, dashboard).
- **PWA**: instalação no celular, ícone na home, funcionamento offline limitado (ex.: ver últimas telas em cache).
- Prioridade: área do Cliente e do Gestor/Produtor (registro rápido de produção/entrega no celular).

### 9.3 Acessibilidade

**Incluir no wireframe (checklist):**
- Contraste mínimo (texto/fundo), rótulos em campos, foco visível em teclado.
- Tabelas com cabeçalhos e escopo; gráficos com texto alternativo ou resumo.

---

## 10. Resumo prioritizado

| Prioridade | Melhoria |
|------------|----------|
| **Alta** | Pipeline Produção → Aprovação → Estoque; status do pedido e tela de pagamento PIX; validação de duplicidade (e-mail/CNPJ); 2FA Admin/Financeiro; auditoria obrigatória nos eventos críticos. |
| **Média** | Carrinho e checkout cliente; cadastro de fornecedores e aprovação de contas do gestor; conciliação financeira; relatórios com exportação Excel/PDF; notificações (e-mail + in-app). |
| **Baixa** | Gamificação; relatórios agendados; PWA completo; preferências granulares de notificação. |

---

Documento de referência para evoluir o wireframe e o backlog do ERP. Cada item pode ser convertido em história de usuário ou tarefa técnica no seu processo de desenvolvimento.
