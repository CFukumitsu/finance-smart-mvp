// Hotfix: ações dos cartões em Contas e Cartões e Categorias.
// O ProcessingButton reserva, invisível, o espaço de "Processando..." quando
// não recebe aria-label. Em botões só-ícone com largura fixa (w-9/w-10) esse
// conteúdo transbordava sobre o botão anterior, que recebia hover e clique do
// vizinho (lápis -> Inativar, Power -> Excluir). O teste lê o JSX pelo AST do
// TypeScript (o projeto não renderiza componentes nos testes) e avalia
// title/aria-label nos estados ativo e inativo.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

type Action = {
  tag: string;
  icon: string;
  handler: string;
  title: (state: Record<string, boolean>) => string;
  ariaLabel: ((state: Record<string, boolean>) => string) | null;
  fixedWidth: boolean;
};

const ICONS = new Set(["TrendingUp", "Pencil", "Power", "CircleOff", "Trash2", "LayoutDashboard"]);

async function readSource(file: string) {
  return readFile(new URL(`../../../${file}`, import.meta.url), "utf8");
}

function attribute(element: ts.JsxOpeningElement, name: string) {
  return element.attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function evaluator(attr: ts.JsxAttribute | undefined, param: string) {
  if (!attr?.initializer) return null;
  const init = attr.initializer;
  const expression = ts.isJsxExpression(init) && init.expression ? init.expression.getText() : init.getText();
  const fn = new Function(param, `return (${expression});`);
  return (state: Record<string, boolean>) => String(fn(state));
}

function calledHandler(attr: ts.JsxAttribute | undefined) {
  const init = attr?.initializer;
  if (!init || !ts.isJsxExpression(init) || !init.expression || !ts.isArrowFunction(init.expression)) return "";
  const body = init.expression.body;
  return ts.isCallExpression(body) ? body.expression.getText() : "";
}

async function iconActions(file: string, param: string): Promise<Action[]> {
  const source = await readSource(file);
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const actions: Action[] = [];
  (function visit(node: ts.Node) {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText();
      const children = node.children.filter((child) => !(ts.isJsxText(child) && !child.getText().trim()));
      const [only] = children;
      if (
        (tag === "button" || tag === "ProcessingButton") &&
        children.length === 1 &&
        ts.isJsxSelfClosingElement(only) &&
        ICONS.has(only.tagName.getText())
      ) {
        const opening = node.openingElement;
        const title = evaluator(attribute(opening, "title"), param);
        assert.ok(title, `${file}: botão ${only.tagName.getText()} sem title`);
        actions.push({
          tag,
          icon: only.tagName.getText(),
          handler: calledHandler(attribute(opening, "onClick")),
          title,
          ariaLabel: evaluator(attribute(opening, "aria-label"), param),
          fixedWidth: /\bw-\d+\b/.test(attribute(opening, "className")?.getText() ?? ""),
        });
      }
    }
    ts.forEachChild(node, visit);
  })(sf);
  return actions;
}

type Expected = { icon: string; handler: string; title: (state: Record<string, boolean>) => string };

function assertActions(actions: Action[], expected: Expected[], states: Record<string, boolean>[]) {
  // Cartões e tabela: a mesma sequência de ações aparece duas vezes.
  assert.equal(actions.length, expected.length * 2);
  actions.forEach((action, index) => {
    const want = expected[index % expected.length];
    assert.equal(action.icon, want.icon);
    assert.equal(action.handler, want.handler, `${action.icon} deve chamar ${want.handler}`);
    assert.ok(action.ariaLabel, `${action.icon} precisa de aria-label`);
    for (const state of states) {
      assert.equal(action.title(state), want.title(state), `${action.icon} title em ${JSON.stringify(state)}`);
      assert.equal(action.ariaLabel!(state), action.title(state), `${action.icon} aria-label difere do title`);
    }
  });
}

test("ProcessingButton só oculta 'Processando...' (sr-only) quando recebe aria-label", async () => {
  const source = await readSource("src/components/ui/Mutation.tsx");
  assert.match(source, /const compact = Boolean\(props\["aria-label"\]\)/);
  assert.match(source, /className=\{compact \? "sr-only" : undefined\}/);
});

test("Contas e Cartões: ícone, title, aria-label e handler associados nos estados ativo e inativo", async () => {
  const actions = await iconActions("app/accounts/page.tsx", "account");
  assertActions(
    actions,
    [
      { icon: "TrendingUp", handler: "openPlanningModal", title: () => "Planejamento" },
      { icon: "Pencil", handler: "openEditDrawer", title: () => "Editar" },
      { icon: "Power", handler: "toggleActive", title: (s) => (s.active ? "Inativar" : "Ativar") },
      { icon: "Trash2", handler: "deleteAccount", title: () => "Excluir" },
    ],
    [{ active: true }, { active: false }],
  );
});

test("Categorias: preserva Dashboard e Planejamento e associa ícone, title, aria-label e handler", async () => {
  const actions = await iconActions("app/categories/page.tsx", "category");
  const states = [true, false].flatMap((active) =>
    [true, false].map((show_on_dashboard) => ({ active, show_on_dashboard })),
  );
  assertActions(
    actions,
    [
      {
        icon: "LayoutDashboard",
        handler: "toggleShowOnDashboard",
        title: (s) => (s.show_on_dashboard ? "Ocultar do Dashboard" : "Mostrar no Dashboard"),
      },
      { icon: "TrendingUp", handler: "openPlanningModal", title: () => "Planejamento" },
      { icon: "Pencil", handler: "openEditDrawer", title: () => "Editar" },
      { icon: "CircleOff", handler: "toggleActive", title: (s) => (s.active ? "Inativar" : "Ativar") },
      { icon: "Trash2", handler: "deleteCategory", title: () => "Excluir" },
    ],
    states,
  );
});

test("ProcessingButton só-ícone com largura fixa sempre recebe aria-label (evita sobrepor o vizinho)", async () => {
  for (const [file, param] of [
    ["app/accounts/page.tsx", "account"],
    ["app/categories/page.tsx", "category"],
  ] as const) {
    const actions = await iconActions(file, param);
    const processing = actions.filter((action) => action.tag === "ProcessingButton" && action.fixedWidth);
    assert.ok(processing.length > 0);
    for (const action of processing) assert.ok(action.ariaLabel, `${file}: ${action.icon} sem aria-label`);
  }
});
