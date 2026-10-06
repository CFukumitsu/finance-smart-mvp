import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Dashboard antigo continua idêntico ao versionado", () => {
  const diff = execFileSync("git", ["diff", "--stat", "HEAD", "--", "app/(private)/dashboard/page.tsx"], {
    cwd: new URL("../../../", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(diff.trim(), "");
});

test("Visão Financeira é a página inicial e o Dashboard antigo segue no menu", () => {
  assert.ok(read("../../../src/utils/identity.ts").includes('export const HOME_ROUTE = "/overview";'));
  assert.ok(read("../../page.tsx").includes("redirect(HOME_ROUTE)"));
  const sidebar = read("../../components/layout/financeSidebar.tsx");
  assert.ok(sidebar.indexOf('href: "/overview"') < sidebar.indexOf('href: "/dashboard"'));
  assert.ok(sidebar.includes('label: "Visão Financeira"'));
  assert.ok(sidebar.includes('label: "Dashboard"'));
  const proxy = read("../../../proxy.ts");
  assert.ok(proxy.includes('"/overview", "/dashboard"'));
  assert.ok(proxy.includes('"/overview/:path*", "/dashboard/:path*"'));
  assert.ok(proxy.includes("dashboardUrl.pathname = HOME_ROUTE;"));
});

test("a página nova não tem nomes de contas, bancos ou valores fixos", () => {
  const sources = [
    read("./page.tsx"),
    read("../../../src/utils/financialOverview.ts"),
    read("../../../src/services/financialOverviewService.ts"),
  ].join("\n");
  for (const forbidden of [/Ita[uú]/i, /Nubank/i, /\bBMG\b/, /\bPorto\b/, /Wise/, /Nomad/, /5\.?000/]) {
    assert.ok(!forbidden.test(sources), `não deve conter ${forbidden}`);
  }
});

test("cadastro permite Reserva/investimento em qualquer moeda (só depende de ser Conta)", () => {
  const accountsPage = read("../../accounts/page.tsx");
  const option = accountsPage.indexOf('<option value="savings">');
  assert.ok(option > 0);
  const guard = accountsPage.slice(accountsPage.lastIndexOf("{", option), option);
  assert.ok(guard.includes('form.type === "Conta"'));
  assert.ok(!/currency/i.test(guard), "a opção não pode depender da moeda");
});
