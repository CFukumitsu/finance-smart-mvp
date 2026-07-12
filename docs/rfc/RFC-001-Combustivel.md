# RFC-001 — Gestão de Combustível

- **Projeto:** Finance Smart (Framework FKT)
- **Estado:** Implementada parcialmente (Fase 1)
- **Data:** 2026-07-12
- **Escopo:** Fase 1 implementada pela FEATURE-001; aplicação da migration e validação remota de RLS permanecem operacionais.

## Estado da implementação (2026-07-12)

Foram implementados categoria especial, cadastros, integração Google Places, lançamento/abastecimento atômico, cálculo por ciclos de tanque cheio, histórico, indicadores e visão geral. A migration está versionada, mas não foi aplicada ao Supabase remoto. A auditoria efetiva das policies com dois usuários depende dessa aplicação em ambiente autorizado.

## Objetivo

Transformar o módulo de combustível em uma solução inteligente integrada ao Finance Smart utilizando Google Maps e Google Places.

## Escopo da Fase 1

### Cadastros

- Veículos
- Postos
- Tipos de combustível

### Lançamentos

A ordem inicial oficial do formulário será `Data` como primeiro campo e `Categoria` como segundo campo. Após a seleção da categoria, o formulário poderá adaptar automaticamente os demais campos e regras. Quando a categoria for `Combustível`, serão exibidos os campos específicos do abastecimento.

Campos previstos:

- Data
- Categoria
- Conta/Cartão
- Valor Total
- Litros
- Valor por litro (calculado)
- Odômetro
- Veículo (padrão do usuário)
- Posto (Google Places)
- Tanque cheio (Sim/Não)
- Observações

### Indicadores

#### Por veículo

- km/l
- custo/km
- litros abastecidos
- gasto mensal
- gasto anual

#### Por posto

- preço médio
- quantidade de abastecimentos
- consumo médio obtido
- ranking

## Fase 2 — Histórico de preços

Manter e consultar o histórico de preços dos combustíveis por posto e data.

## Fase 3 — Ranking inteligente de postos

O ranking deverá considerar futuramente:

- avaliação Google
- preço médio
- km/l obtido
- frequência de abastecimento

Os pesos, critérios de desempate e regras de transparência do ranking deverão ser aprovados antes da implementação.

## Fase 4 — Mapa

- postos próximos
- melhor posto
- último abastecimento

## Fase 5 — Assistente IA

Exemplos:

- onde vale mais a pena abastecer?
- meu carro está consumindo mais?
- vale trocar gasolina por etanol?
- qual posto oferece o melhor custo-benefício?

## Regras de Negócio

- Data será o primeiro campo do lançamento.
- Categoria será o segundo campo do lançamento.
- Após a seleção da categoria, o formulário poderá adaptar os demais campos e regras automaticamente.
- Quando `Categoria = Combustível`, serão exibidos os campos específicos do abastecimento.
- O veículo poderá possuir um padrão.
- Google Places será utilizado para localizar postos.
- O posto poderá ser criado automaticamente.
- O Google Place ID será armazenado no banco.
- O cálculo oficial de km/l ocorrerá entre dois abastecimentos marcados como `Tanque Cheio`.
- Abastecimentos parciais acumulam litros até o próximo tanque cheio.

## Integrações previstas

- **Finance Smart:** o abastecimento deverá permanecer vinculado ao lançamento financeiro correspondente.
- **Google Places:** pesquisa, identificação e cadastro assistido de postos.
- **Google Maps:** visualização geográfica prevista para a Fase 4.

O uso das integrações deverá respeitar privacidade, segurança de chaves, limites de quota, custos e termos dos provedores.

## Fora do escopo desta RFC documental

- Implementação de código, páginas, componentes, hooks ou services.
- Alteração do banco, migrations ou políticas RLS.
- Definição física de tabelas, colunas, índices ou constraints.
- Alteração de `package.json` ou inclusão de dependências.
- Aprovação automática de fórmulas financeiras além das regras expressamente registradas.

## Critérios para iniciar implementação

Antes de qualquer fase entrar em desenvolvimento, será necessário:

1. obter aprovação explícita do responsável pelo projeto;
2. detalhar critérios de aceite e cenários de teste;
3. aprovar o modelo de dados e registrar seus efeitos em `docs/DATABASE.md`;
4. definir migrations e políticas RLS com isolamento por `owner_id`;
5. validar impactos nas regras financeiras e nos lançamentos existentes;
6. definir tratamento de erros, privacidade, custos e quotas das APIs Google;
7. registrar decisão arquitetural em `docs/DECISIONS.md` quando aplicável.
