# Roadmap — Finance Smart / Framework FKT

## Finalidade

Este roadmap organiza a evolução do Finance Smart por módulos. Ele não autoriza implementação: prioridades, escopo e critérios de aceite devem ser aprovados antes de cada iniciativa.

## Princípios transversais

- Preservar regras financeiras e dados existentes.
- Garantir isolamento multiusuário com autenticação e RLS.
- Reutilizar componentes e centralizar regras de domínio.
- Manter build, tipagem e acessibilidade como critérios de conclusão.
- Registrar decisões arquiteturais relevantes em `docs/DECISIONS.md`.

## Módulo 0 — Fundação FKT

**Estado:** documentação inicial estabelecida.

- Consolidar documentação de arquitetura, padrões e banco.
- Inventariar regras financeiras existentes e criar uma matriz de rastreabilidade.
- Definir estratégia de testes, observabilidade e ambientes.
- Gerar tipos TypeScript a partir do schema do Supabase.
- Versionar o schema e as políticas RLS por migrations.
- Planejar a convergência da organização atual sem migração arquitetural implícita.

## Módulo 1 — Identidade e acesso

**Base atual:** login, logout, recuperação e redefinição de senha, contexto de autenticação e proteção de rotas.

- Auditar sessão e proteção de todas as rotas privadas.
- Documentar papéis e permissões caso surjam perfis além do proprietário.
- Validar expiração, recuperação de sessão e mensagens de erro.
- Testar isolamento de dados entre usuários.

## Módulo 2 — Cadastros financeiros

**Base atual:** contas/cartões, categorias e competências.

- Consolidar validações e contratos tipados.
- Padronizar estados ativo/inativo e regras de exclusão.
- Documentar dependências entre cadastros e lançamentos.
- Cobrir planejamento por conta e categoria.

## Módulo 3 — Lançamentos

**Base atual:** receitas, despesas, transferências, pagamento de fatura e parcelamento.

- Formalizar a máquina de estados de pagamento/recebimento.
- Documentar sinais, datas, competência e vínculos entre transferências.
- Cobrir criação, edição e exclusão com testes de domínio.
- Revisar idempotência de operações compostas.

## Módulo 4 — Planejamento e dashboard

**Base atual:** metas por competência, conta e categoria; indicadores e gráficos.

- Definir indicadores oficiais do Framework FKT.
- Centralizar cálculos hoje consumidos por múltiplas telas.
- Validar comparação entre planejado, realizado e pendente.
- Definir desempenho e estratégia de agregação para grandes volumes.

## Módulo 5 — Recorrências

**Base atual:** recorrências mensais de receita e despesa e geração de lançamentos.

- Formalizar ciclo de vida, período de vigência e cancelamento.
- Garantir geração idempotente por competência.
- Cobrir dias inexistentes no mês e competências fechadas.
- Planejar frequências adicionais somente após aprovação de regra financeira.

## Módulo 6 — Fechamentos

**Base atual:** fechamento/reabertura de competência, conta e fatura de cartão.

- Documentar invariantes e permissões de reabertura.
- Validar snapshots e saldos de abertura/fechamento.
- Garantir atomicidade de fechamento e pagamento de fatura.
- Criar trilha de auditoria para alterações críticas.

## Módulo 7 — Conciliação e importação

**Base atual:** importação de arquivos, layouts por conta, itens de extrato e vínculos com lançamentos; legado Access.

- Formalizar formatos suportados e validações.
- Garantir deduplicação e idempotência de importações.
- Documentar fluxo de conciliação, ignorados e reversão.
- Isolar o importador legado e definir política de retenção dos artefatos.

## Módulo 8 — Gestão de Combustível

**Documento de referência:** [`RFC-001 — Gestão de Combustível`](rfc/RFC-001-Combustivel.md).

**Objetivo:** transformar o módulo de combustível em uma solução inteligente integrada ao Finance Smart, com apoio do Google Maps e Google Places, sem comprometer as regras financeiras existentes.

### Fase 1 — Cadastros, lançamentos e indicadores

**Estado:** implementada no código; pendente aplicar a migration versionada e validar RLS no ambiente Supabase.

- Estruturar os cadastros de veículos, postos e tipos de combustível.
- Manter `Data` como primeiro campo e `Categoria` como segundo campo do lançamento.
- Planejar a adaptação automática dos demais campos e regras após a seleção da categoria.
- Exibir os campos específicos de abastecimento quando a categoria for `Combustível`.
- Integrar conceitualmente veículos, postos, litros, preço por litro, odômetro e tanque cheio ao lançamento financeiro.
- Definir o veículo padrão do usuário e a localização de postos com Google Places.
- Definir indicadores por veículo e por posto.
- Formalizar o cálculo oficial de consumo entre abastecimentos com tanque cheio e o acúmulo de abastecimentos parciais.

### Fase 2 — Histórico de preços

- Consolidar o histórico de preços por posto, combustível e data.
- Definir critérios de comparação temporal e qualidade dos dados.

### Fase 3 — Ranking inteligente de postos

- Definir ranking considerando avaliação Google, preço médio, consumo obtido e frequência de abastecimento.
- Documentar pesos, critérios de desempate e transparência da recomendação antes da implementação.

### Fase 4 — Mapa

- Planejar a visualização de postos próximos.
- Destacar o melhor posto conforme critérios aprovados.
- Exibir a referência do último abastecimento.
- Auditar privacidade de localização, custos e segurança das chaves de integração.

### Fase 5 — Assistente IA

- Responder perguntas sobre melhor local para abastecer, variações de consumo, comparação entre gasolina e etanol e custo-benefício dos postos.
- Definir fontes, limites, explicabilidade e proteção dos dados antes de disponibilizar recomendações.

## Módulo 9 — Relatórios e exportações

- Definir relatórios oficiais e filtros por competência.
- Criar exportações auditáveis em formatos aprovados.
- Preservar precisão monetária e fuso horário.
- Planejar impressão e acessibilidade.

## Módulo 10 — Qualidade, segurança e operação

- Implantar testes unitários para cálculos e integrações para fluxos críticos.
- Criar pipeline com lint, build, testes e verificação de migrations.
- Auditar RLS regularmente com usuários isolados.
- Definir logs sem dados sensíveis, métricas e alertas.
- Definir backup, restauração e resposta a incidentes.
- Estabelecer metas de desempenho e compatibilidade de navegadores.

## Critério de entrada de uma iniciativa

Uma iniciativa só deve entrar em implementação quando possuir responsável, objetivo, escopo, critérios de aceite, impactos no banco/RLS, impacto financeiro, riscos, estratégia de testes e decisão arquitetural registrada quando aplicável.
