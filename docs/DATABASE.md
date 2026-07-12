# Banco de dados atual

## Escopo e fonte

O Finance Smart usa Supabase/PostgreSQL e autenticação Supabase. Este inventário foi elaborado a partir das consultas e tipos presentes no código em 2026-07-12.

O repositório contém a migration `supabase/migrations/202607120001_feature_001_fuel_phase_1.sql`. Ela ainda precisa ser aplicada em ambiente autorizado. Portanto:

A migration corretiva `202607120002_fix_fuel_records_station_fk.sql` garante explicitamente a constraint `fuel_records_station_id_fkey` quando `fuel_records` já existia antes da migration inicial e solicita a atualização do schema cache do PostgREST.

- as tabelas e colunas abaixo são as observadas pela aplicação, não uma definição canônica do schema implantado;
- tipos SQL, defaults, nulabilidade, índices, constraints, triggers e cascatas não podem ser confirmados integralmente;
- as políticas RLS implantadas não podem ser auditadas apenas por este repositório;
- qualquer alteração exige inspeção autorizada do projeto Supabase e migration versionada.

## Convenções observadas

- Identificadores são tratados como `string`, normalmente compatíveis com UUID.
- Valores monetários chegam ao cliente como `number`.
- Datas usam strings ISO ou `YYYY-MM-DD`; competências usam nome `YYYY-MM`.
- Dados multiusuário usam `owner_id` nas consultas e mutações observadas.
- Relações são representadas por colunas com sufixo `_id`.
- Datas de auditoria recorrentes: `created_at` e `updated_at`.

## Visão relacional

```text
auth.users
  └─ owner_id em entidades do usuário

competences ─┬─ transactions ─┬─ accounts
             │                └─ categories
             ├─ financial_targets
             ├─ recurring_transactions
             ├─ competence_closures
             ├─ account_closures
             └─ credit_card_statements

credit_card_statements ─ credit_card_statement_items
transactions ─ credit_card_statement_item_transactions ─ credit_card_statement_items
accounts ─ import_layouts

vehicles              fuel_stations
```

As tabelas de combustível foram observadas em arquivos locais ainda não versionados. Registros de abastecimento e relações entre veículos e postos não aparecem em consultas persistentes verificáveis no estado inspecionado.

## Tabelas financeiras principais

### `accounts`

Contas bancárias e cartões do usuário.

| Coluna observada | Uso/valores observados |
| --- | --- |
| `id` | Identificador |
| `owner_id` | Proprietário |
| `name` | Nome da conta/cartão |
| `type` | `Conta` ou `Cartão` |
| `closing_day` | Dia de fechamento do cartão |
| `due_day` | Dia de vencimento |
| `limit_amount` | Limite do cartão |
| `current_balance` | Saldo atual informado |
| `active` | Estado ativo/inativo |

### `categories`

Classificação de lançamentos e parâmetros de exibição/planejamento.

| Coluna observada | Uso/valores observados |
| --- | --- |
| `id` | Identificador |
| `owner_id` | Proprietário |
| `name` | Nome |
| `type` | `Receita`, `Despesa` ou `Transferência` |
| `monthly_limit` | Limite mensal legado/configurável |
| `monthly_goal` | Meta mensal legada/configurável |
| `show_on_dashboard` | Exibição no dashboard |
| `dashboard_order` | Ordenação no dashboard |
| `active` | Estado ativo/inativo |
| `special_type` | Função especial opcional: `fuel`, `vehicle_maintenance`, `parking`, `toll` ou `vehicle_insurance` |

### `competences`

Períodos mensais de referência financeira.

| Coluna observada | Uso/valores observados |
| --- | --- |
| `id` | Identificador |
| `owner_id` | Proprietário |
| `name` | Competência em formato `YYYY-MM` |
| `month` | Mês numérico |
| `year` | Ano numérico |
| `status` | Estado da competência |

### `transactions`

Lançamentos financeiros.

| Coluna observada | Uso/valores observados |
| --- | --- |
| `id` | Identificador |
| `owner_id` | Proprietário |
| `description` | Descrição |
| `due_date` | Data do lançamento/vencimento |
| `created_at` | Criação |
| `type` | `Receita`, `Despesa`, `Transferência` ou `Pagamento de Fatura` |
| `mode` | Modalidade do lançamento |
| `value` | Valor monetário |
| `status` | `Recebido`, `Pago`, `Pendente` e estados correlatos usados pelo fluxo |
| `account_id` | Conta/cartão associado |
| `category_id` | Categoria associada |
| `competence_id` | Competência associada |
| `origin_account_id` | Origem de transferência |
| `destination_account_id` | Destino de transferência |
| `recurring_transaction_id` | Origem recorrente observada no gerador |
| `installment_group_id` | Agrupamento de parcelas observado no fluxo |
| `installment_number` | Número da parcela |
| `installment_count` | Total de parcelas |

## Planejamento e recorrência

### `financial_targets`

Planejamento por competência e alvo.

| Coluna observada | Uso/valores observados |
| --- | --- |
| `owner_id` | Proprietário |
| `competence_id` | Competência |
| `target_type` | `account` ou `category` |
| `target_id` | Conta ou categoria conforme o tipo |
| `planned_value` | Valor planejado |

### `recurring_transactions`

Modelos para geração de lançamentos mensais.

| Coluna observada | Uso/valores observados |
| --- | --- |
| `id` | Identificador |
| `owner_id` | Proprietário |
| `description` | Descrição |
| `type` | `income` ou `expense` |
| `amount` | Valor |
| `account_id` | Conta opcional |
| `category_id` | Categoria opcional |
| `frequency` | Atualmente `monthly` |
| `day_of_month` | Dia de 1 a 31 |
| `start_competence_id` | Competência inicial |
| `end_competence_id` | Competência final opcional |
| `status` | `active` ou `cancelled` |
| `created_at` | Criação |
| `updated_at` | Atualização |

## Fechamentos

### `competence_closures`

Snapshot e estado de fechamento de uma competência.

| Coluna observada | Uso |
| --- | --- |
| `id`, `owner_id`, `competence_id` | Identidade, proprietário e competência |
| `status` | `Aberta` ou `Fechada` |
| `closed_at`, `reopened_at` | Eventos de fechamento/reabertura |
| `total_income`, `total_expense`, `balance` | Totais do snapshot |
| `pending_income`, `pending_expense` | Valores pendentes |
| `paid_income`, `paid_expense` | Valores realizados |
| `created_at`, `updated_at` | Auditoria |

Conflito lógico observado no upsert: combinação `owner_id, competence_id`.

### `account_closures`

Fechamento de conta por competência.

| Coluna observada | Uso |
| --- | --- |
| `id`, `owner_id` | Identidade e proprietário |
| `account_id`, `competence_id` | Conta e competência |
| `opening_balance`, `closing_balance` | Saldos de abertura e fechamento |
| `status` | Estado do fechamento |

### `credit_card_statements`

Fatura de cartão por competência.

| Coluna observada | Uso |
| --- | --- |
| `id`, `owner_id` | Identidade e proprietário |
| `account_id`, `competence_id` | Cartão e competência |
| `statement_total` | Total da fatura |
| `status` | Estado da fatura |
| `payment_account_id` | Conta usada para pagamento |
| `payment_due_date` | Data de pagamento/vencimento |
| `payment_transaction_id` | Lançamento de pagamento relacionado |

## Conciliação e importação

### `credit_card_statement_items`

Itens importados de extratos/faturas. A aplicação observa campos de identidade, proprietário, conta, fatura/competência, chave e hash de importação, data, descrição, valor, status e motivo de item ignorado. O conjunto exato deve ser confirmado no schema remoto.

### `credit_card_statement_item_transactions`

Tabela de associação entre itens importados e lançamentos. São observados vínculos por `statement_item_id` e `transaction_id`, com filtragem por proprietário nos fluxos relacionados.

### `import_layouts`

Configuração de layout de importação por conta.

| Coluna observada | Uso |
| --- | --- |
| `id`, `owner_id`, `account_id` | Identidade, proprietário e conta |
| `name` | Nome do layout |
| `is_active` | Layout vigente |
| `header_row_index` | Linha do cabeçalho |
| `date_column_index` | Coluna de data |
| `description_column_index` | Coluna de descrição |
| `value_column_index` | Coluna de valor único |
| `credit_column_index`, `debit_column_index` | Colunas separadas de crédito/débito |
| `layout_type` | Tipo detectado/configurado |
| `signature` | Assinatura do formato |

## Módulo combustível observado

### `vehicles`

Colunas observadas: `id`, `owner_id`, `name`, `brand`, `model`, `model_year`, `plate`, `fuel_type`, `tank_capacity`, `initial_odometer`, `is_default`, `active`, `created_at`.

### `fuel_stations`

Colunas observadas: `id`, `owner_id`, `name`, `brand`, `address`, `neighborhood`, `city`, `state`, `postal_code`, `latitude`, `longitude`, `active`, `created_at`.

A migration adiciona metadados do Google (`google_place_id`, URI, avaliação, contagem, status, tipo, nome/endereço formatados e sincronização) e unicidade de Place ID por proprietário.

### `fuel_records`

Vincula unicamente um lançamento a veículo e posto, preservando combustível, hodômetro, litros, preço unitário, total, tanque cheio, localização e observações. A FK de `transaction_id` usa `ON DELETE CASCADE`; veículos e postos históricos usam `ON DELETE RESTRICT`.

### Função `save_fuel_transaction`

Cria ou atualiza lançamento e abastecimento na mesma transação PostgreSQL, valida proprietário do veículo e posto e evita lançamento financeiro órfão.

## RLS e segurança

O código filtra diversas operações por `owner_id`, mas isso não substitui RLS. O estado das políticas remotas é **não verificado**.

Requisitos para auditoria:

1. Confirmar RLS habilitada em todas as tabelas de dados do usuário.
2. Confirmar políticas de `SELECT`, `INSERT`, `UPDATE` e `DELETE` com `owner_id = auth.uid()` e `WITH CHECK` nas escritas.
3. Validar tabelas filhas e associações contra acesso indireto entre proprietários.
4. Testar com dois usuários e registrar evidências.
5. Versionar correções por migrations aprovadas.

## Artefatos legados

`Dados Access/` contém CSVs, resumo e um script manual de importação do legado. O script inclui operações destrutivas (`truncate`) e não deve ser executado sem autorização explícita, backup e validação do ambiente de destino.

## Pendências para tornar este documento canônico

- Adicionar migrations versionadas ao repositório.
- Gerar e versionar tipos TypeScript do schema.
- Registrar tipos SQL, defaults, nulabilidade, PKs, FKs, índices, checks e unicidade.
- Registrar policies, funções, triggers, views e buckets de Storage.
- Criar diagrama relacional a partir do schema real.
