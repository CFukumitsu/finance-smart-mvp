# Decisões arquiteturais

## Objetivo

Este documento é o índice de Architecture Decision Records (ADRs) do Finance Smart / Framework FKT. Ele registra decisões futuras que afetem arquitetura, domínio, banco, segurança, integrações ou padrões compartilhados.

Nenhuma entrada neste arquivo substitui autorização explícita para alterar a arquitetura ou regras financeiras.

## Estado das decisões

| Estado | Significado |
| --- | --- |
| Proposta | Em discussão; não autoriza implementação |
| Aceita | Aprovada e válida para novas alterações |
| Rejeitada | Avaliada e não adotada |
| Substituída | Trocada por outra ADR, que deve ser referenciada |
| Obsoleta | Não se aplica mais, sem substituição direta |

## Índice

Nenhuma decisão arquitetural formal foi registrada até o momento.

| ADR | Título | Estado | Data | Substitui |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

## Registro técnico — FEATURE-001

- A escrita composta de `transactions` e `fuel_records` usa a função PostgreSQL `save_fuel_transaction`, garantindo rollback conjunto.
- O consumo oficial é calculado no cliente por helper puro, usando ciclos encerrados por dois registros de tanque cheio e acumulando abastecimentos parciais intermediários.
- Google Places permanece atrás de Route Handlers e usa somente `GOOGLE_MAPS_API_KEY` no servidor.

## Processo obrigatório

1. Criar uma proposta antes da implementação.
2. Descrever contexto, restrições, alternativas e impactos.
3. Identificar efeitos em regras financeiras, schema, RLS, segurança, migração e compatibilidade.
4. Obter aprovação do responsável pelo projeto.
5. Atualizar o estado para `Aceita` e somente então implementar.
6. Registrar consequências observadas e referências ao pull request ou commit.
7. Nunca apagar uma ADR; marcar como substituída ou obsoleta para preservar o histórico.

## Template de ADR

Copiar a seção abaixo para uma nova entrada, usando numeração sequencial com quatro dígitos.

```markdown
## ADR-0001 — Título curto da decisão

- Estado: Proposta
- Data: AAAA-MM-DD
- Responsáveis: nome(s)
- Escopo: módulo(s)
- Referências: issue/PR/documentos

### Contexto

Qual problema precisa ser resolvido, quais forças atuam e quais restrições existem?

### Decisão

Qual solução foi escolhida? Seja específico o suficiente para orientar a implementação.

### Alternativas consideradas

1. Alternativa A — vantagens e desvantagens.
2. Alternativa B — vantagens e desvantagens.

### Consequências

- Benefícios esperados.
- Custos, riscos e limitações.
- Impactos operacionais e de manutenção.

### Impacto em dados e segurança

- Schema/migration:
- RLS/permissões:
- Migração e rollback:
- Dados sensíveis:

### Impacto financeiro

- Regras, cálculos, arredondamentos ou fechamentos afetados:
- Aprovação específica do responsável:

### Validação

- Critérios de aceite:
- Testes necessários:
- Métricas de acompanhamento:
```
