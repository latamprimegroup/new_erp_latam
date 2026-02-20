# Regra de uso exclusivo de e-mail

## Princípios

1. **Um e-mail = uma conta** — Cada e-mail da base só pode ser utilizado em **uma única** conta de anúncio.
2. **Um e-mail = um colaborador por vez** — Um e-mail não pode ser reservado/enviado para mais de um colaborador ao mesmo tempo.

## Ciclo de vida do e-mail

```
AVAILABLE → RESERVED → CONSUMED
   ↑           │           │
   └───────────┘           │
   (liberar reserva)       │
                           └──→ Nunca mais reutilizado
```

| Status    | Significado                                                                 |
|-----------|-----------------------------------------------------------------------------|
| AVAILABLE | Disponível no estoque. Nenhum colaborador reservou.                         |
| RESERVED  | Reservado por **um** colaborador. Outros não podem reservá-lo.              |
| CONSUMED  | Já utilizado em uma conta de produção. **Nunca mais será reutilizado.**     |

## Como a regra é aplicada

### 1. Reserva (RESERVED)
- Só itens com status `AVAILABLE` podem ser reservados.
- Ao reservar, o e-mail recebe `assignedToProducerId` = ID do colaborador.
- Nenhum outro colaborador consegue reservar o mesmo e-mail.
- Somente o colaborador que reservou pode liberar a reserva (devolver ao estoque) ou consumir.

### 2. Uso em produção (CONSUMED)
- O colaborador usa o e-mail reservado para criar uma conta.
- O sistema marca o e-mail como `CONSUMED` e vincula à conta via `ProductionAccount.emailId`.
- O e-mail fica permanentemente ligado a essa conta; não volta mais ao estoque.

### 3. Rastreabilidade
- **Quem usou**: `ProductionAccount.producerId` (colaborador que produziu a conta).
- **Em qual conta**: `ProductionAccount` vinculado ao e-mail (ID da conta, plataforma, tipo).
- Na Base → E-mails, a coluna **"Usado por / Conta"** exibe: nome do colaborador + ID da conta.

## Garantias técnicas

| Garantia                      | Como é garantida                                               |
|------------------------------|----------------------------------------------------------------|
| E-mail único no sistema      | `Email.email` com constraint `@unique`                         |
| Um e-mail por conta          | `ProductionAccount.emailId` com constraint `@unique`           |
| Reserva exclusiva            | Validação: só reserva se status = AVAILABLE                    |
| Liberar só o dono da reserva | Validação: `assignedToProducerId === producerId`               |
| Consumo irreversível         | Status CONSUMED + vínculo com `ProductionAccount`              |

## Fluxo resumido

1. Admin faz upload de e-mails (ou cadastro manual) → status `AVAILABLE`.
2. Colaborador reserva o e-mail → status `RESERVED`; ninguém mais pode reservar.
3. Colaborador usa na produção → status `CONSUMED`; e-mail vinculado à conta.
4. Consulta: na Base, coluna "Usado por / Conta" mostra **quem** (colaborador) e **em qual conta** o e-mail foi usado.
