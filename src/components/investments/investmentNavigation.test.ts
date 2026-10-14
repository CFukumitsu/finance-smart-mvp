import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Investimentos tem cinco áreas, nesta ordem: Visão geral, Carteira, Operações, Ativos cadastrados e Configurações", () => {
  const screen = read("src/components/investments/InvestmentScreen.tsx");
  const order = [
    ["/investments", "Visão geral"],
    ["/investments/portfolio", "Carteira"],
    ["/investments/operations", "Operações"],
    ["/investments/assets", "Ativos cadastrados"],
    ["/investments/settings", "Configurações"],
  ].map(([href, label]) => {
    const index = screen.indexOf(`"${href}", "${label}"`);
    assert.ok(index > 0, `${label} no menu`);
    return index;
  });
  assert.deepEqual([...order].sort((left, right) => left - right), order);
  for (const page of ["portfolio", "settings", "assets", "operations"]) {
    assert.ok(existsSync(`app/(private)/investments/${page}/page.tsx`));
  }
  // Operações continua com os mesmos componentes.
  assert.match(screen, /<InvestmentAccountEvents data=\{data\} reload=\{reload\} \/>/);
  assert.match(screen, /<InvestmentOperations data=\{data\} reload=\{reload\} \/>/);
});

test("Ativos cadastrados: área própria reutilizando o cadastro existente; links antigos continuam funcionando", () => {
  const page = read("app/(private)/investments/assets/page.tsx");
  assert.match(page, /<InvestmentScreen view="assets" \/>/);
  assert.ok(!page.includes("redirect("), "/investments/assets volta a ser a própria tela");
  assert.match(read("src/components/investments/InvestmentScreen.tsx"), /view === "assets" \? \(\s*<InvestmentAssets data=\{data\} reload=\{reload\} \/>/);
  const portfolio = read("src/components/investments/InvestmentPortfolio.tsx");
  assert.ok(!portfolio.includes("<InvestmentAssets"), "cadastro saiu da Carteira");
  // /investments/portfolio#ativos (publicado na etapa anterior) leva à nova área.
  assert.match(portfolio, /window\.location\.hash === "#ativos"\) router\.replace\("\/investments\/assets"\)/);
  assert.match(portfolio, /href="\/investments\/assets"/);
});

test("Visão geral: patrimônio consolidado em destaque, sem degradê, e ordem das seções", () => {
  const overview = read("src/components/investments/InvestmentDashboard.tsx");
  const hero = overview.indexOf('id="consolidated-wealth-title"');
  const positions = [
    hero,
    overview.indexOf('label="Investimentos financeiros"'),
    overview.indexOf('label="Capital investido"'),
    overview.indexOf("<WealthDistribution"),
    overview.indexOf('id="investment-summary-title"'),
    overview.indexOf('id="reservas-em-caixa"'),
  ];
  assert.ok(positions.every((position) => position > 0));
  assert.deepEqual([...positions].sort((left, right) => left - right), positions);
  const heroBlock = overview.slice(overview.lastIndexOf("<section", hero), hero);
  assert.ok(!/gradient|from-|via-|to-slate|shadow-2xl/.test(heroBlock), "sem degradê escuro nem sombra pesada");
  assert.ok(overview.includes("Valor parcial"));
  assert.ok(overview.includes("Registrar operação"));
  assert.ok(!overview.includes("Contas utilizadas"));
  // Linha de moedas estrangeiras só para quem usa multimoeda.
  assert.match(overview, /\{multiCurrency && \(/);
  assert.ok(!overview.includes("InvestmentExchangeSettings"), "câmbio fica em Configurações");
});

test("distribuição: gráfico único de barras, sem pizza/rosca e sem biblioteca nova", () => {
  const chart = read("src/components/investments/WealthDistribution.tsx");
  assert.ok(chart.includes('"Por classe"') && chart.includes('"Por conta/instituição"'));
  assert.ok(!/recharts|Pie|Donut|Doughnut/i.test(chart));
  assert.match(chart, /readDistributionMode\(/);
  assert.match(chart, /writeDistributionMode\(/);
  assert.ok(chart.includes("Total considerado"));
});

test("Carteira mantém os dados secundários e reutiliza os componentes existentes", () => {
  const portfolio = read("src/components/investments/InvestmentPortfolio.tsx");
  for (const piece of ["Contas utilizadas", "summary.assetCount", "Contas por saldo", "Posição atual", "<InvestmentValuations"]) {
    assert.ok(portfolio.includes(piece), piece);
  }
});

test("barra de filtros não espreme a pesquisa no desktop", () => {
  const ui = read("src/components/investments/InvestmentUi.tsx");
  assert.match(ui, /xl:\[&>select\]:w-auto/);
  assert.match(ui, /xl:min-w-64/);
});

test("menu principal: Visão Financeira, Dashboard, Lançamentos, Investimentos e depois os demais na ordem de antes", () => {
  const sidebar = read("app/components/layout/financeSidebar.tsx");
  const hrefs = [...sidebar.matchAll(/href: "(\/[^"]*)"/g)].map((match) => match[1]);
  const main = hrefs.slice(0, hrefs.indexOf("/fuel"));
  assert.deepEqual(main, [
    "/overview",
    "/dashboard",
    "/transactions",
    "/investments",
    "/analytics",
    "/reconciliation",
    "/bankroll",
    "/closings",
    "/recurrences",
    "/accounts",
    "/categories",
    "/competences",
  ]);
});
