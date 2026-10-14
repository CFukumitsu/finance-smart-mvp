import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Investimentos tem quatro áreas: Visão geral, Carteira, Operações e Configurações", () => {
  const screen = read("src/components/investments/InvestmentScreen.tsx");
  for (const [href, label] of [
    ["/investments", "Visão geral"],
    ["/investments/portfolio", "Carteira"],
    ["/investments/operations", "Operações"],
    ["/investments/settings", "Configurações"],
  ]) {
    assert.ok(screen.includes(`"${href}", "${label}"`), `${label} no menu`);
  }
  assert.ok(existsSync("app/(private)/investments/portfolio/page.tsx"));
  assert.ok(existsSync("app/(private)/investments/settings/page.tsx"));
  // Operações continua com os mesmos componentes.
  assert.match(screen, /<InvestmentAccountEvents data=\{data\} reload=\{reload\} \/>/);
  assert.match(screen, /<InvestmentOperations data=\{data\} reload=\{reload\} \/>/);
});

test("o endereço antigo de Ativos continua funcionando (redireciona para a Carteira)", () => {
  assert.match(read("app/(private)/investments/assets/page.tsx"), /redirect\("\/investments\/portfolio#ativos"\)/);
});

test("Visão geral: patrimônio consolidado em destaque e sem indicadores secundários", () => {
  const overview = read("src/components/investments/InvestmentDashboard.tsx");
  const hero = overview.indexOf('id="consolidated-wealth-title"');
  assert.ok(hero > 0 && hero < overview.indexOf('label="Capital investido"'));
  assert.ok(!overview.includes("Quantidade de ativos"));
  assert.ok(!overview.includes("Contas utilizadas"));
  // Linha de moedas estrangeiras só para quem usa multimoeda.
  assert.match(overview, /\{multiCurrency && \(/);
  assert.ok(!overview.includes("InvestmentExchangeSettings"), "câmbio fica em Configurações");
});

test("Carteira mantém os dados secundários e reutiliza os componentes existentes", () => {
  const portfolio = read("src/components/investments/InvestmentPortfolio.tsx");
  for (const piece of ["Contas utilizadas", "summary.assetCount", "Contas por saldo", "Posição atual", "<InvestmentValuations", "<InvestmentAssets"]) {
    assert.ok(portfolio.includes(piece), piece);
  }
});

test("barra de filtros não espreme a pesquisa no desktop", () => {
  const ui = read("src/components/investments/InvestmentUi.tsx");
  assert.match(ui, /xl:\[&>select\]:w-auto/);
  assert.match(ui, /xl:min-w-64/);
});
