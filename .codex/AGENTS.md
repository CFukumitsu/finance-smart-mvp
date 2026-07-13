# Guia de agentes — Finance Smart / Framework FKT

## Objetivo do projeto

O Finance Smart é a aplicação-base do Framework FKT para gestão financeira pessoal. O projeto organiza contas, cartões, categorias, competências, lançamentos, planejamento, recorrências, fechamentos, conciliação e módulos complementares. Toda evolução deve preservar a confiabilidade dos cálculos financeiros, o isolamento dos dados por usuário e a experiência já disponível.

Este arquivo é obrigatório para qualquer agente de IA que trabalhe no repositório. Em caso de conflito, as instruções do solicitante e as regras do `AGENTS.md` da raiz têm precedência.

## Arquitetura

- Aplicação web monolítica em Next.js com App Router.
- Rotas, layouts, páginas e Route Handlers ficam em `app/`.
- Rotas são agrupadas por intenção com route groups, como `(auth)` e `(private)`, sem alterar a URL.
- Código compartilhado fica em `src/`, separado por responsabilidade.
- Supabase fornece autenticação e persistência PostgreSQL; o cliente atual é inicializado em `src/lib/supabase.ts`.
- Páginas são Server Components por padrão. Usar Client Components somente quando estado, efeitos, eventos, hooks ou APIs do navegador forem necessários.
- Regras de domínio e cálculos não devem ficar duplicados em páginas; devem ser centralizados em `services`, `utils` ou módulos de domínio existentes.
- Antes de alterar qualquer implementação Next.js, ler o guia pertinente em `node_modules/next/dist/docs/`, pois a versão instalada pode divergir de conhecimento anterior.

## Stack

- Next.js 16 (App Router)
- React 19 e React DOM 19
- TypeScript em modo `strict`
- Tailwind CSS 4 via PostCSS
- Supabase (`@supabase/supabase-js` e `@supabase/ssr`)
- Lucide React para ícones
- Recharts para gráficos
- SheetJS (`xlsx`) para importação de planilhas
- ESLint 9 com regras Next.js Core Web Vitals e TypeScript
- npm e `package-lock.json` para dependências

## Estrutura de pastas

```text
app/                         Rotas, layouts, páginas, APIs e UI ligada a rotas
  (auth)/                    Fluxos públicos de autenticação
  (private)/                 Áreas autenticadas organizadas sem mudar a URL
  api/                       Route Handlers e integrações server-side
  components/                Componentes hoje compartilhados por páginas em app
src/
  components/                Componentes compartilhados, agrupados por domínio
  contexts/                  Contratos de Context
  hooks/                     Hooks reutilizáveis
  lib/                       Clientes e infraestrutura
  providers/                 Providers React
  services/                  Acesso a dados e operações de aplicação
  types/                     Tipos compartilhados de domínio
  utils/                     Funções puras e guardas de domínio
public/                      Arquivos estáticos
docs/                        Roadmap, decisões, banco e padrões
Dados Access/                Artefatos legados de importação; não é código-fonte
```

Não reorganizar essa estrutura ou mover responsabilidades entre camadas sem autorização explícita.

## Fluxo obrigatório antes de qualquer alteração

1. Ler `AGENTS.md` da raiz, este arquivo e a documentação aplicável em `docs/`.
2. Conferir `git status` e preservar mudanças preexistentes do usuário.
3. Identificar o escopo exato e os critérios de aceite; não ampliar a tarefa por conta própria.
4. Inspecionar implementações semelhantes e pesquisar componentes, hooks, services, helpers e tipos reutilizáveis.
5. Se houver Next.js no escopo, ler o guia pertinente em `node_modules/next/dist/docs/` antes de escrever código.
6. Mapear impactos em autenticação, Supabase, RLS, regras financeiras e funcionalidades existentes.
7. Implementar a menor alteração coesa possível, sem refatorações oportunistas.
8. Revisar o diff e confirmar que não há arquivos, credenciais ou mudanças fora do escopo.
9. Executar os testes disponíveis e obrigatoriamente `npm run build`.
10. Corrigir todos os erros de compilação introduzidos ou encontrados antes de concluir. Se um bloqueio externo tornar isso impossível, documentá-lo com a saída relevante e não declarar sucesso.
11. Sempre mostrar o diff ao solicitante, resumindo arquivos alterados e efeitos.

## Regras de desenvolvimento

- Nunca alterar a arquitetura sem autorização explícita.
- Nunca remover, ocultar ou degradar funcionalidades existentes.
- Nunca alterar regras financeiras, fórmulas, sinais, arredondamentos, competências, saldos, fechamentos ou status sem aprovação explícita.
- Sempre reutilizar componentes, hooks, services, helpers e tipos existentes antes de criar novos.
- Nunca criar código duplicado. Extraia comportamento compartilhado para a camada adequada quando autorizado pelo escopo.
- Não misturar correções ou refatorações não solicitadas.
- Manter TypeScript estrito; não usar `any` para contornar modelagem.
- Não expor segredos, service role keys ou variáveis privadas no cliente.
- Não editar `package.json`, banco, políticas ou migrations sem autorização específica.
- Preservar textos e formatos de domínio em português do Brasil quando fizerem parte da interface ou do banco atual.
- Sempre executar `npm run build`, corrigir erros de compilação e mostrar o diff antes de concluir.

## Padrão de commits

Usar Conventional Commits, em português ou inglês consistente dentro do commit:

```text
<tipo>(<escopo opcional>): <descrição curta no imperativo>
```

Tipos permitidos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`, `perf`, `build`, `ci`, `revert`.

Exemplos:

```text
docs: documenta padrões do Framework FKT
fix(transactions): corrige validação de competência fechada
```

O commit deve ser atômico, não incluir artefatos gerados ou mudanças alheias e explicar no corpo decisões ou riscos relevantes. Breaking changes exigem autorização explícita e marcador `BREAKING CHANGE:`.

## Padrão de componentes

- Nome de componente e arquivo em `PascalCase`; props com sufixo `Props`.
- Um componente deve ter responsabilidade clara, props tipadas e API pequena.
- Procurar primeiro em `app/components/` e `src/components/`; reutilizar e estender o existente quando compatível.
- Componentes compartilhados pertencem a `src/components/<domínio>/`; componentes exclusivos de rota podem ficar colocalizados na rota.
- Manter páginas focadas em composição e coordenação. Extrair blocos reutilizáveis ou complexos.
- Usar Server Component por padrão e adicionar `"use client"` somente na fronteira interativa mínima.
- Não duplicar markup, estilos ou comportamento para criar variações quase idênticas.
- Preservar acessibilidade: HTML semântico, labels, foco, teclado, estados de carregamento/erro e contraste.
- Ícones devem vir de Lucide React quando houver equivalente já adotado.

## Padrão de hooks

- Arquivo e função começam com `use`, por exemplo `useAuth.ts` e `useAuth`.
- Hooks ficam em `src/hooks/`, salvo hook estritamente privado e colocalizado de um domínio.
- Hook encapsula estado/efeitos reutilizáveis; não deve virar service nem conter regra financeira duplicada.
- Dependências de efeitos e callbacks devem ser completas e estáveis.
- Retorno deve ser tipado, previsível e expor apenas o necessário.
- Não chamar hooks condicionalmente e não acessar APIs do navegador fora de Client Components.

## Padrão de services

- Arquivo em `camelCase` com sufixo `Service.ts` e funções nomeadas orientadas à ação.
- Services ficam em `src/services/` e concentram acesso ao Supabase e operações de aplicação reutilizáveis.
- Obter o usuário autenticado pelo helper existente e filtrar dados por `owner_id` quando a tabela for multiusuário.
- Retornar tipos explícitos e erros úteis; não engolir erros do Supabase.
- Validar travas de conta e competência antes de mutações financeiras, reutilizando os guards existentes.
- Não misturar renderização, alertas ou navegação dentro do service.
- Operações compostas que exijam atomicidade devem ser implementadas no banco por função transacional autorizada, nunca simuladas silenciosamente no cliente.

## Regras para Supabase

- Usar os clientes e helpers existentes; não criar clientes Supabase ad hoc.
- Nunca usar `SUPABASE_SERVICE_ROLE_KEY` em código cliente nem versionar credenciais.
- Toda tabela com dados do usuário deve possuir `owner_id` e toda consulta cliente deve restringir explicitamente pelo usuário autenticado, como defesa adicional à RLS.
- Selecionar somente as colunas necessárias quando possível.
- Tratar `error` em todas as operações e considerar estados de carregamento, vazio e falha.
- Alterações de schema devem ser feitas por migration versionada e revisável, somente com autorização; nunca diretamente pelo app ou por instrução manual isolada.
- Não executar truncate, delete em massa ou scripts de importação sem autorização e backup confirmado.
- Manter tipos de banco gerados/centralizados quando essa infraestrutura for adotada; não espalhar casts incompatíveis.

## Regras para RLS

- RLS é obrigatória em toda tabela exposta pelo Supabase que contenha dados por usuário.
- Políticas devem cobrir separadamente `SELECT`, `INSERT`, `UPDATE` e `DELETE`, conforme a necessidade real.
- A condição padrão de isolamento é `owner_id = auth.uid()`; em `INSERT`, validar também com `WITH CHECK`.
- Tabelas filhas devem impedir acesso indireto a registros de outro usuário, validando o proprietário da linha e/ou do pai.
- Nunca desabilitar RLS para resolver erro de acesso.
- Nunca criar política permissiva usando `true` para dados privados.
- Alterações de política exigem migration, revisão e testes com ao menos dois usuários distintos.
- Service role ignora RLS e deve permanecer exclusivamente em ambiente server-side controlado.
- A documentação local não prova as políticas implantadas. Antes de mudar acesso, auditar o schema remoto autorizado e registrar o resultado em `docs/DATABASE.md`.

## Restrições invioláveis

Sem autorização explícita do responsável pelo projeto:

- nunca alterar a arquitetura;
- nunca remover funcionalidades existentes;
- nunca alterar regras financeiras;
- nunca alterar banco, RLS ou contratos públicos;
- nunca substituir um componente reutilizável por código duplicado.

