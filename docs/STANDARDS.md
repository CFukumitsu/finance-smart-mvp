# Padrões de desenvolvimento

## Escopo

Este documento define os padrões do Finance Smart / Framework FKT. Ele complementa `.codex/AGENTS.md` e não autoriza mudanças arquiteturais, financeiras ou de banco.

## Nomenclatura

| Elemento | Padrão | Exemplo |
| --- | --- | --- |
| Componentes e providers | `PascalCase` | `LoginForm`, `AuthProvider` |
| Arquivos de componente | `PascalCase.tsx` | `UserMenu.tsx` |
| Hooks | `useCamelCase` | `useModalShortcuts` |
| Services | `camelCaseService.ts` | `closingService.ts` |
| Helpers e utils | `camelCase` | `calculateAccountFinalBalance` |
| Tipos e interfaces | `PascalCase` | `RecurringTransaction` |
| Props | `<Componente>Props` | `FinanceSidebarProps` |
| Variáveis e funções | `camelCase` | `currentCompetence` |
| Constantes imutáveis globais | `UPPER_SNAKE_CASE` | `MAX_IMPORT_SIZE` |
| Rotas e pastas de URL | `kebab-case` | `forgot-password` |
| Tabelas e colunas SQL | `snake_case` | `recurring_transactions` |
| Booleanos | prefixo semântico | `isLoading`, `hasError`, `canEdit` |

Manter termos de domínio existentes no idioma em que foram definidos. Não traduzir valores persistidos, como `Receita`, `Despesa`, `Conta` e `Cartão`, sem migration e aprovação de regra financeira.

## Componentes

- Usar Server Components por padrão no App Router.
- Usar `"use client"` apenas na menor fronteira que precise de estado, efeitos, eventos, hooks ou APIs do navegador.
- Um componente deve representar uma responsabilidade e possuir props explicitamente tipadas.
- Reutilizar primeiro `src/components/` e `app/components/`; evitar cópias com pequenas diferenças.
- Componentes globais compartilhados ficam em `src/components/<domínio>/`.
- Componentes exclusivos de uma rota podem ser colocalizados na rota; não promovê-los prematuramente.
- Páginas devem coordenar dados e compor UI, não concentrar componentes reutilizáveis ou regras financeiras.
- Preferir composição a flags booleanas em excesso. Variantes devem ter contrato finito e tipado.
- Elementos interativos devem ter nome acessível, foco visível, suporte a teclado e estados desabilitado/carregando.
- Usar Lucide React para ícones já cobertos pela biblioteca.

## Tailwind CSS

- O projeto usa Tailwind CSS 4 por `@import "tailwindcss"` em `app/globals.css`.
- Usar utilities diretamente nos componentes para estilos locais.
- Reutilizar tokens e padrões visuais existentes antes de introduzir novas cores, sombras, raios ou espaçamentos.
- Reservar `app/globals.css` para imports, tokens globais, resets e comportamentos realmente globais.
- Evitar estilos inline, valores arbitrários repetidos e CSS global específico de componente.
- Ordenar classes por grupos legíveis: layout, dimensão/espaçamento, tipografia, aparência, estado e responsividade.
- Preservar responsividade mobile-first e verificar estados `hover`, `focus-visible`, `disabled` e dark quando aplicável.
- Se uma sequência extensa de classes se repetir, reutilizar um componente; não criar duplicação textual.
- Não adicionar biblioteca de merge/variantes sem autorização e justificativa arquitetural.

## Organização das pastas

```text
app/                 roteamento e convenções do App Router
app/(auth)/          rotas de autenticação
app/(private)/       rotas privadas agrupadas sem alterar URL
app/api/             Route Handlers server-side
app/components/      componentes compartilhados atualmente ligados às rotas
src/components/      componentes compartilhados por domínio
src/contexts/        definições de contextos
src/providers/       providers React
src/hooks/           hooks reutilizáveis
src/services/        acesso a dados e operações da aplicação
src/lib/             infraestrutura e integrações
src/types/           tipos compartilhados
src/utils/           funções puras e guardas
docs/                documentação viva
public/              assets estáticos
```

- Não mover arquivos apenas por preferência estética.
- Não criar uma segunda pasta com a mesma responsabilidade.
- Route groups entre parênteses organizam rotas sem compor a URL.
- Antes de adotar nova convenção Next.js, consultar `node_modules/next/dist/docs/` da versão instalada.

## Helpers

- Helpers puros e reutilizáveis ficam em `src/utils/`; infraestrutura e adaptadores ficam em `src/lib/`.
- Função deve ter nome verbal e contrato pequeno, previsível e tipado.
- Não acessar React, DOM ou Supabase dentro de helper puro.
- Cálculos financeiros devem ser centralizados, testáveis e nunca duplicados na UI.
- Formatação não deve alterar o valor de domínio; conversão de moeda e datas deve declarar locale e fuso quando relevante.
- Não criar arquivo genérico `helpers.ts` para responsabilidades desconexas; agrupar por domínio.

## Hooks

- Nome e arquivo iniciam com `use`.
- Colocar hooks compartilhados em `src/hooks/` e hooks privados próximos ao domínio consumidor.
- Hook gerencia comportamento React reutilizável; acesso a dados compartilhado deve delegar ao service.
- Não duplicar regra financeira ou transformação de domínio dentro de hooks.
- Declarar dependências completas em efeitos e callbacks; limpar listeners, timers e subscriptions.
- Retornar objeto nomeado quando houver múltiplos valores e ações.
- Não usar hooks condicionalmente.

## Services

- Services ficam em `src/services/`, com arquivo `camelCaseService.ts` e exports nomeados.
- Um service representa operações coesas de um domínio, não uma coleção genérica.
- Centralizar consultas e mutações reutilizáveis do Supabase.
- Obter o usuário com o helper existente e restringir por `owner_id` em dados multiusuário.
- Tratar erros explicitamente e retornar/lançar contratos consistentes.
- Validar guards de competência e conta antes de mutações financeiras.
- Não usar alerts, router, JSX ou estado React em services.
- Não expor chaves privadas. Integrações com segredo devem ficar em fronteiras server-side.
- Exigir transação no banco para operações que precisem de atomicidade.

## Padrões de importação

Ordem recomendada, separada por linha em branco:

1. React e Next.js.
2. Bibliotecas externas.
3. Módulos internos pelo alias `@/`.
4. Imports relativos locais.
5. Estilos ou assets, quando aplicável.

Regras:

- Usar o alias `@/` para imports entre áreas do projeto; reservar relativos para arquivos próximos.
- Usar `import type` quando o símbolo só existe no sistema de tipos.
- Evitar caminhos relativos profundos como `../../../`.
- Não criar barrel files se causarem ciclos, ampliarem bundle cliente ou ocultarem dependências.
- Não importar módulos server-only em Client Components.
- Remover imports não usados e evitar aliases desnecessários.

## Padrões de tipagem

- TypeScript permanece em `strict`; não reduzir rigor no `tsconfig`.
- Não usar `any`. Para dados desconhecidos, usar `unknown` e fazer narrowing/validação.
- Modelar uniões finitas para estados de domínio, como `"active" | "cancelled"`.
- Usar `type` para unions, aliases e props; `interface` pode ser usada quando extensão pública for intencional. Manter consistência no módulo.
- Declarar nulabilidade real com `null` e opcionalidade com `?`; não tratá-las como equivalentes.
- Tipos compartilhados ficam em `src/types/`; tipos estritamente locais ficam próximos ao consumidor.
- Não duplicar tipos de uma mesma entidade em múltiplas páginas. Consolidar quando o escopo permitir.
- Não usar casts para esconder divergências do banco; corrigir o contrato ou validar os dados.
- Valores monetários precisam de semântica clara. Não arredondar ou converter sem regra aprovada.
- Datas persistidas devem usar formatos explícitos; evitar parsing dependente do locale.
- Props, retornos de services e funções exportadas devem possuir contratos compreensíveis e estáveis.

## Qualidade e conclusão

Antes de concluir qualquer alteração:

1. revisar o diff completo;
2. confirmar reutilização e ausência de duplicação;
3. executar validações específicas disponíveis;
4. executar obrigatoriamente `npm run build`;
5. corrigir erros de compilação;
6. informar o diff e qualquer risco residual.

