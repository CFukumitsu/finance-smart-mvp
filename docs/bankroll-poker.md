# Bankroll Poker — decisões da Fase 1

O saldo não é persistido: `saldo inicial + movimentações com sinal + resultado das sessões`. Valores são consolidados separadamente por código ISO de moeda; não há câmbio implícito.

Movimentações armazenam valor positivo e uma direção estruturada. Tipos fixos têm direção validada por constraint; somente `adjustment` permite escolha explícita. Todos os campos monetários da interface usam um parser único, com prioridade para o formato brasileiro (`1.234,56`), e entradas inválidas interrompem o envio em vez de virar zero.

Transferências usam duas linhas (`transfer_out` e `transfer_in`) com o mesmo `transfer_group_id`. O CRUD autenticado da tabela é limitado por RLS a movimentações comuns. As RPCs `create_bankroll_transfer`, `update_bankroll_transfer` e `delete_bankroll_transfer` são `SECURITY DEFINER`, têm `search_path` explícito, derivam o proprietário exclusivamente de `auth.uid()` e são executáveis somente por `authenticated`. Elas bloqueiam carteiras e pares com `FOR UPDATE`, exigem duas linhas afetadas e validam o par completo antes de concluir. As funções auxiliares e a Service Role não recebem permissão de execução.

A trigger diferida garante que cada grupo existente tenha exatamente uma saída e uma entrada simétricas, com o mesmo proprietário, valor, data e moeda, em duas carteiras diferentes. Depois da exclusão integral, zero linhas é um estado válido. Uma trigger separada impede alterar a moeda de uma carteira que já possua movimentação ou sessão; a interface também desabilita somente esse campo e mantém os demais editáveis.

Sessões diferentes de cash usam `investido = buy_in + reentries × reentry_cost + add_on_cost + fees` e `resultado = prize - investido`. Cash usa `investido = cash_buy_in + fees` e `resultado = cash_out - investido`, mas seu ROI é sempre ausente. Somente `tournament`, `sit_and_go` e `spin` são competitivos e entram em ROI, ABI, ITM e total investido competitivo; `other` usa o modelo financeiro compatível, mas fica fora desses indicadores.

A evolução agrupa todas as variações por dia. Quando há filtro de período, calcula primeiro o saldo de abertura com o saldo inicial e todo o histórico anterior, exibe um ponto de abertura na data inicial e então aplica apenas as variações do intervalo. Na visão consolidada, uma transferência tem efeito líquido zero e aparece uma única vez; na visão por carteira, a origem recebe somente `transfer_out` e o destino somente `transfer_in`.

Os testes SQL reproduzíveis ficam em `supabase/tests/bankroll_poker_phase_1_test.sql`. Eles devem rodar apenas sobre um banco Supabase local isolado, depois da aplicação deliberada da migration nesse ambiente, e terminam sempre com `ROLLBACK`.

## Direção adotada para a integração financeira

Uma tabela de vínculo relaciona uma movimentação de bankroll a um lançamento financeiro sem copiar valores nem misturar saldos. Depósito no bankroll liga-se a uma saída financeira; saque, a uma entrada. O vínculo é único em ambos os lados e recebe uma chave idempotente. Transferências internas entre carteiras nunca geram lançamento financeiro. Conversão cambial permanece fora desta fase.
# Fase 2 — integração com o Financeiro

## Decisões de arquitetura

A integração trata depósitos e saques como movimentações patrimoniais externas estruturadas. O lançamento usa a semântica já suportada pelo Finance: `deposit` cria uma `Transferência` paga na conta de origem; `withdrawal` cria uma `Transferência` recebida na conta. `bankroll_integration_group_id` e `bankroll_operation_type` identificam exclusivamente o vínculo. A movimentação não entra em Receita, Despesa, metas, economia, resultado mensal ou indicadores operacionais.

Somente contas ativas com `accounts.type = 'Conta'` e moeda confirmada são elegíveis. Cartões de crédito são bloqueados. `accounts.currency` é nullable para preservar contas históricas cuja moeda ainda não foi comprovada; não existe backfill global. `BRL` é apenas o default de novos registros. O usuário confirma manualmente a moeda das contas antigas, e uma moeda confirmada não pode ser alterada depois que existir histórico monetário. A validação atual normaliza maiúsculas e aceita três letras; validação ISO 4217 completa permanece melhoria futura. Não há conversão cambial nesta fase.

## Fluxos

- Depósito integrado: saída financeira (`Transferência`, status `Pago`) e entrada `deposit` no Bankroll.
- Saque integrado: saída `withdrawal` no Bankroll e entrada financeira (`Transferência`, status `Recebido`).
- Somente Bankroll: mantém o CRUD atual e não cria lançamento financeiro.
- Transferência entre carteiras: continua usando as RPCs da Fase 1 e não toca o Financeiro.

As datas e valores são idênticos nos dois módulos. Operações integradas futuras não são permitidas porque ainda não existe status pendente ou agendado no Bankroll. Essa é uma limitação funcional conhecida, não uma regra patrimonial definitiva. A competência é obtida pelo mecanismo oficial `ensure_competence`. Competência fechada, conta fechada, conta inativa, carteira inativa, owner divergente, moeda divergente, saldo Finance insuficiente ou saldo Bankroll insuficiente abortam toda a transação.

## Modelo e atomicidade

`bankroll_finance_links` mantém um vínculo único entre um lançamento financeiro e uma movimentação Bankroll. Na criação, `idempotencyKey` é obrigatório e vira o `integration_group_id`; o cliente conserva essa chave durante novas tentativas da mesma operação. Depois da criação, `integrationGroupId` identifica exclusivamente uma integração existente para atualização ou exclusão. A repetição com a mesma chave e os mesmos dados devolve os mesmos IDs; reutilização com dados diferentes é rejeitada. As FKs compostas garantem o mesmo `owner_id`; não existe cascade destrutivo sobre o histórico financeiro.

As RPCs públicas são:

- `create_bankroll_finance_deposit`
- `create_bankroll_finance_withdrawal`
- `update_bankroll_finance_operation`
- `delete_bankroll_finance_operation`

Todas usam `SECURITY DEFINER`, `search_path = pg_catalog`, derivam o proprietário somente de `auth.uid()`, bloqueiam os registros com `FOR UPDATE` e confirmam a quantidade alterada. Funções auxiliares não têm EXECUTE para papéis da API. Apenas `authenticated` executa as quatro RPCs públicas.

Triggers impedem criação de vínculo falso, CRUD parcial, troca de owner, alteração do grupo e alteração direta de qualquer lado integrado. Uma constraint trigger `DEFERRABLE INITIALLY DEFERRED` valida owner, grupo, operação, tipo, status, direção, valor, data, moeda, conta e cardinalidade. A edição valida os períodos e contas original e novo. A exclusão respeita fechamentos e continua permitida se conta ou carteira tiver sido inativada.

## Saldos e concorrência

O cálculo geral do Finance não foi substituído. O depósito usa a forma histórica de saída por transferência e o saque usa a forma histórica de entrada recebida. Funções auxiliares privadas da integração calculam somente a disponibilidade necessária para impedir depósito sem saldo na conta e saque sem saldo na carteira; o saldo da carteira inclui saldo inicial, movimentações e resultado das sessões.

As RPCs usam a mesma ordem global: advisory lock do grupo; locks de competência e escopo; contas em ordem de ID; carteiras em ordem de ID; vínculo; lançamento Finance; movimentação Bankroll. O lock do grupo é a barreira inicial compartilhada por criação, atualização e exclusão. O estado de fechamento existente é apenas consultado para impedir alterações em períodos já fechados; a migration do Bankroll não cria, altera ou protege a arquitetura geral de fechamento.

O guard de CRUD não usa JWT customizado, descrição ou variável de sessão. Escrita integrada atravessa o guard somente dentro das RPCs `SECURITY DEFINER` owned por `postgres`; manutenção administrativa continua sujeita à invariante diferível. `service_role` possui somente `SELECT` em `bankroll_finance_links` para auditoria e clonagem, sem mutação direta e sem uso no frontend.

## RLS e histórico

A tabela de vínculos permite SELECT apenas para `owner_id = auth.uid()`. INSERT, UPDATE e DELETE diretos possuem policies negativas e também são recusados pelo guard do banco. Registros históricos anteriores não recebem vínculo e continuam classificados como “Somente Bankroll”. Nenhum backfill de integração é realizado.

## Interface

Depósito e saque oferecem os modos “Integrado ao Financeiro” e “Somente no Bankroll”. O modo integrado é o padrão, filtra contas elegíveis pela moeda e apresenta o impacto nos dois módulos antes de salvar. O grid mostra conta vinculada e os estados “Integrado”, “Somente Bankroll” ou “Inconsistente”. Em telas pequenas, os dados prioritários são exibidos em cards. O modal bloqueia duplo envio, fecha por ESC e confirma exclusões integradas.

No Financeiro, o lançamento recebe a indicação “Origem: Bankroll Poker”. A edição e exclusão comuns são bloqueadas e orientam o usuário para o módulo Bankroll. O dashboard Bankroll oferece atalhos para depósito, saque, sessão e movimentação.

## Evolução patrimonial futura

O vínculo permite distinguir dinheiro em contas, dinheiro em carteiras de poker, transferência interna de patrimônio e ganho real de sessões. A Fase 2 não implementa patrimônio líquido, investimentos, bens, dívidas, câmbio ou dashboard patrimonial global.

## Validação local futura

A migration `202607190002_bankroll_finance_integration.sql` deve ser revisada antes de qualquer aplicação. Depois da aprovação, ela poderá ser aplicada apenas no Supabase local isolado e a suíte `supabase/tests/bankroll_finance_integration_test.sql` executada dentro da transação que termina em `ROLLBACK`. O runner `supabase/tests/bankroll_finance_concurrency_test.ps1` prepara os cenários reais de duas sessões e rejeita URLs não locais; ele exige uma fixture local explícita. Nenhum desses testes SQL é executado nesta etapa. DEV e PROD permanecem fora desta etapa.
