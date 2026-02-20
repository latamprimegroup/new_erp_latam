# Sistema de SMS para Validação de Contas

Sistema de aluguel de números de telefone para receber SMS de validação (Google, etc.) vinculado às contas entregues ao cliente.

## Provedor: 5sim.net

- **Documentação**: https://5sim.net/en/docs
- **Cadastro**: https://5sim.net
- Autenticação: `Authorization: Bearer FIVESIM_API_KEY`

## Variáveis de Ambiente

```env
FIVESIM_API_KEY=          # API key da conta 5sim (obrigatório para alugar)
FIVESIM_DEFAULT_COUNTRY=brazil
FIVESIM_DEFAULT_OPERATOR=  # vazio = "any"
```

## Fluxo

1. **Produção/Admin** aluga número via `POST /api/admin/sms/rent`
   - Body: `{ stockAccountId ou productionG2Id, country?, operator?, service? }`
   - O número é vinculado à conta e salvo em `twoFaSms` nas credenciais

2. **Uso**: Use o número retornado quando o Google (ou outro serviço) pedir validação por SMS no cadastro da conta

3. **Recebimento**: Quando o Google enviar o SMS, o provedor recebe. O cliente pode:
   - Acessar **Minhas Contas** → expandir **Validação SMS**
   - Clicar em **Buscar novos códigos** para buscar o SMS no provedor e exibir o código

4. **Liberação**: Admin pode liberar número via `POST /api/admin/sms/release` com `{ rentedPhoneId }`

## APIs

| Método | Rota | Quem | Descrição |
|--------|------|------|-----------|
| POST | /api/admin/sms/rent | ADMIN, PRODUCER, FINANCE | Alugar número e vincular à conta |
| POST | /api/admin/sms/release | ADMIN, PRODUCER, FINANCE | Liberar número alugado |
| GET | /api/cliente/contas/[id]/sms | CLIENT | Listar número e SMS da conta |
| POST | /api/cliente/contas/[id]/sms/check | CLIENT | Buscar novos SMS no provedor |

## Modelos

- **RentedPhoneNumber**: número alugado, vinculado a StockAccount ou ProductionG2
- **SmsInbox**: SMS recebidos no número (corpo, código extraído, data)

## Área do Cliente

Em **Minhas Contas e Gastos** (`/dashboard/cliente/contas`), cada conta possui seção **Validação SMS (códigos Google)** que, ao expandir, mostra:
- Número vinculado
- Botão "Buscar novos códigos"
- Lista de códigos recebidos
