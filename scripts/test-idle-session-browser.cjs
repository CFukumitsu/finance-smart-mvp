/* eslint-disable @typescript-eslint/no-require-imports -- Node/webpack test harness uses CommonJS. */
// Local browser integration: real provider, LoginForm and Supabase SDK;
// the Auth HTTP server is a deterministic test double, with no production data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const crypto = require("node:crypto");
const root = process.cwd();
const deps = process.env.CODEX_NODE_MODULES;
const { chromium } = require(deps ? path.join(deps, "playwright") : "playwright");
const webpackRuntime = require("next/dist/compiled/webpack/webpack");

const { webpack } = webpackRuntime;
const { DefinePlugin } = webpack;
const baseline = process.argv.includes("--baseline");
const fast = !process.argv.includes("--production-times");
process.env.FIN04_FAST = fast ? "1" : "0";
const output = fs.mkdtempSync(path.join(os.tmpdir(), "fin04-browser-"));
const baselineDir = process.env.FIN04_BASELINE;
const sessions = new Map();
let logoutRequests = 0;
function user(session) {
  return { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "test@example.test", email_confirmed_at: session.at, created_at: session.at, last_sign_in_at: session.at, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [] };
}
function token(session) {
  const part = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return part({ alg: "HS256", typ: "JWT" }) + "." + part({ sub: user(session).id, session_id: session.id, aud: "authenticated", role: "authenticated", iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 }) + ".test-signature";
}
function payload(session) { return { access_token: token(session), refresh_token: session.id, token_type: "bearer", expires_in: 3600, user: user(session) }; }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = (status, data) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  if (url.pathname.startsWith("/auth/v1/")) {
    let body = ""; for await (const chunk of req) body += chunk;
    const input = body ? JSON.parse(body) : {};
    if (url.pathname === "/auth/v1/token") {
      let s;
      if (url.searchParams.get("grant_type") === "password") {
        s = { id: crypto.randomUUID(), at: new Date().toISOString() };
        sessions.set(s.id, s);
      } else s = sessions.get(input.refresh_token);
      return s ? json(200, payload(s)) : json(400, { message: "Invalid refresh token", error_code: "refresh_token_not_found" });
    }
    if (url.pathname === "/auth/v1/logout") {
      logoutRequests++;
      const bearer = req.headers.authorization?.split(" ")[1];
      if (bearer) { const claim = JSON.parse(Buffer.from(bearer.split(".")[1], "base64url")); sessions.delete(claim.session_id); }
      return json(200, {});
    }
    if (url.pathname === "/auth/v1/user") {
      const bearer = req.headers.authorization?.split(" ")[1];
      const claim = bearer && JSON.parse(Buffer.from(bearer.split(".")[1], "base64url"));
      const s = claim && sessions.get(claim.session_id);
      return s ? json(200, user(s)) : json(401, { message: "No user" });
    }
  }
  if (url.pathname === "/bundle.js") { res.writeHead(200, { "Content-Type": "application/javascript" }); return res.end(fs.readFileSync(path.join(output, "bundle.js"))); }
  if (url.pathname === "/api/auth/providers") return json(200, { google: false });
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end('<!doctype html><html><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const alias = { "@": root, "next/navigation": path.join(root, "tests/idle-session/navigation.cjs") };
  if (baseline) {
    alias["@/src/providers/AuthProvider"] = path.join(baselineDir, "baseline-AuthProvider.tsx");
    alias["@/src/utils/idleSession"] = path.join(baselineDir, "baseline-idleSession.ts");
    alias["@/src/services/authService"] = path.join(baselineDir, "baseline-authService.ts");
  }
  // Specific aliases must win over the generic @ prefix.
  const ordered = Object.fromEntries(Object.entries(alias).sort((a,b) => b[0].length-a[0].length));
  await new Promise((resolve, reject) => {
    const compiler = webpack({ mode: "development", entry: path.join(root, "tests/idle-session/entry.cjs"), output: { path: output, filename: "bundle.js" },
      resolve: { extensions: [".tsx", ".ts", ".js", ".cjs"], alias: ordered, modules: [path.join(root, "node_modules")] },
      module: { rules: [{ test: /\.tsx?$/, use: path.join(root, "tests/idle-session/loader.cjs") }] },
      plugins: [new DefinePlugin({ "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(origin), "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify("local-test-key") })],
      devtool: false,
    });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const report = [];
  const logs = [];
  const contexts = [];
  const extraBrowsers = [];
  const setup = async (name) => {
    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    if (!fast) await page.clock.install();
    page.on("console", (m) => { if (m.text().includes("FIN04")) logs.push({ test: name, text: m.text() }); });
    page.on("pageerror", (e) => logs.push({ test: name, error: e.message }));
    await page.goto(origin + "/login");
    await page.getByLabel("E-mail", { exact: true }).fill("test@example.test");
    await page.getByLabel("Senha", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByTestId("protected").waitFor();
    return { page, context };
  };
  const state = (page) => page.evaluate(async () => {
    const { data } = await window.testSupabase.auth.getSession();
    const key = data.session && window.idleKey(data.session);
    return { key, last: key && localStorage.getItem(key), timeouts: window.timeouts, authenticated: !!data.session };
  });
  const loggedOut = async (page) => {
    await page.waitForURL("**/login", { timeout: 12000 });
    await page.getByLabel("Senha", { exact: true }).waitFor();
    assert.equal((await state(page)).authenticated, false);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function run(name, fn) {
    try { await fn(); report.push({ name, result: "PASS" }); console.log("PASS", name); }
    catch (error) { report.push({ name, result: "FAIL", error: error.message }); console.error("FAIL", name, error.message); }
  }
  try {
    await run("baseline de configuração", async () => {
      const { page } = await setup("config");
      const s = await state(page);
      assert.equal(s.timeouts.logout, fast ? 30000 : 1800000);
      assert.equal(s.timeouts.warning, fast ? 25000 : 1500000);
      await page.context().close();
    });
    if (baseline) {
      await run("reprodução: navegação automática prolonga sessão", async () => {
        const { page } = await setup("automatic-navigation");
        const before = await state(page);
        await wait(1200);
        await page.evaluate(() => window.automaticNavigation("/automatic"));
        const after = await state(page);
        assert.ok(Number(after.last) > Number(before.last));
      });
      await run("reprodução: inicialização recria registro ausente", async () => {
        const { page } = await setup("missing-record");
        await page.evaluate(async () => {
          const { data } = await window.testSupabase.auth.getSession();
          localStorage.removeItem(window.idleKey(data.session));
        });
        await page.addInitScript(() => localStorage.clear());
        await page.reload();
        await page.getByTestId("protected").waitFor();
        assert.ok(Number((await state(page)).last) > 0);
      });
      await run("aba parada + renovação Supabase por 32 segundos", async () => {
        const { page } = await setup("idle-baseline");
        await page.evaluate(() => { window.refreshTest = setInterval(() => window.testSupabase.auth.refreshSession(), 4000); });
        await wait(32000);
        await loggedOut(page);
      });
    } else {
      await run("passivo não escreve atividade: refresh, foco, rotas e re-render", async () => {
        const { page } = await setup("passive");
        const before = await state(page);
        await wait(300);
        await page.evaluate(async () => {
          await window.testSupabase.auth.refreshSession();
          await window.testAuth("SIGNED_IN");
          window.dispatchEvent(new Event("focus"));
          document.dispatchEvent(new Event("visibilitychange"));
          window.automaticNavigation("/automatic");
        });
        await wait(300);
        assert.equal((await state(page)).last, before.last);
        await page.context().close();
      });
      await run("registro ausente exige login", async () => {
        const { page } = await setup("missing");
        await page.evaluate(async () => { const { data } = await window.testSupabase.auth.getSession(); localStorage.removeItem(window.idleKey(data.session)); });
        await page.reload();
        await loggedOut(page);
      });
      const a = await setup("idle");
      const b = await setup("closed-tab");
      const bState = await state(b.page);
      await b.page.close();
      const c = await setup("reload");
      const frozen = await c.context.newCDPSession(c.page);
      if (fast) await frozen.send("Page.setWebLifecycleState", { state: "frozen" });
      const d = await setup("background");
      const background = await d.context.newPage();
      await background.goto("about:blank");
      await background.bringToFront();
      const e = await setup("two-tabs");
      const other = await e.context.newPage();
      await other.goto(origin + "/dashboard");
      await other.getByTestId("protected").waitFor();
      const twoBefore = await state(e.page);
      await wait(300);
      await other.getByRole("button", { name: "Interagir", exact: true }).click();
      await wait(200);
      const twoAfter = await state(e.page);
      assert.ok(Number(twoAfter.last) > Number(twoBefore.last));
      const continuation = await setup("continue");
      const continueTest = async () => {
        await continuation.page.getByRole("dialog").waitFor({ timeout: 1000 });
        const before = await state(continuation.page);
        await continuation.page.evaluate(() => document.querySelector("dialog button").click());
        assert.equal((await state(continuation.page)).last, before.last, "synthetic click must not renew activity");
        await continuation.page.getByRole("button", { name: "Continuar conectado", exact: true }).click();
        assert.ok(Number((await state(continuation.page)).last) > Number(before.last));
        await continuation.page.getByRole("dialog").waitFor({ state: "detached" });
        await continuation.context.close();
      };
      const start = Date.now();
      if (!fast) {
        await continuation.page.clock.fastForward(1500001);
        await run("aviso, clique sintético ignorado e Continuar conectado", continueTest);
        for (const ctx of [a.context, c.context, d.context, e.context]) {
          await ctx.pages()[0].clock.fastForward(1800001);
        }
      } else {
        // Real wall clock, without focus or input on authenticated pages.
        await wait(26000);
        await run("aviso após 25 segundos, clique sintético ignorado e Continuar conectado", continueTest);
        await wait(6000);
      }
      await run("tela parada: logout e novo login obrigatório", () => loggedOut(a.page));
      await run("fechar aba e reabrir após prazo", async () => {
        const page = await b.context.newPage();
        if (!fast) await page.clock.install({ time: Date.now() + 1800001 });
        await page.goto(origin + "/dashboard");
        await loggedOut(page);
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), bState.key), "0");
      });
      await run("refresh depois do prazo com página suspensa", async () => { await c.page.reload(); await loggedOut(c.page); });
      await run("aba em segundo plano", () => loggedOut(d.page));
      await run("duas abas: atividade compartilhada e logout em ambas", async () => { await loggedOut(e.page); await loggedOut(other); });
      console.log("Elapsed real idle ms:", Date.now() - start);
      await run("novo login após expiração e logout manual", async () => {
        await a.page.getByLabel("E-mail", { exact: true }).fill("test@example.test");
        await a.page.getByLabel("Senha", { exact: true }).fill("test-password");
        await a.page.getByRole("button", { name: "Entrar", exact: true }).click();
        await a.page.getByTestId("protected").waitFor();
        await a.page.getByRole("button", { name: "Sair", exact: true }).click();
        await loggedOut(a.page);
      });

      await run("navegador minimizado: prazo preservado e logout", async () => {
        const visibleBrowser = await chromium.launch({ channel: "msedge", headless: false, ignoreDefaultArgs: ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"] });
        extraBrowsers.push(visibleBrowser);
        const context = await visibleBrowser.newContext();
        const page = await context.newPage();
        if (!fast) await page.clock.install();
        await page.goto(origin + "/login");
        await page.getByLabel("E-mail", { exact: true }).fill("test@example.test");
        await page.getByLabel("Senha", { exact: true }).fill("test-password");
        await page.getByRole("button", { name: "Entrar", exact: true }).click();
        await page.getByTestId("protected").waitFor();
        const before = await state(page);
        const cdp = await context.newCDPSession(page);
        await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
        const { windowId } = await cdp.send("Browser.getWindowForTarget");
        await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
        const { bounds } = await cdp.send("Browser.getWindowBounds", { windowId });
        assert.equal(bounds.windowState, "minimized");
        await page.waitForFunction(() => !document.hasFocus(), null, { polling: 100, timeout: 5000 });
        console.log("Minimized window, document visibility:", await page.evaluate(() => document.visibilityState));
        if (fast) await wait(32000);
        else { await page.clock.fastForward(1800001); }
        await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
        await loggedOut(page);
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), before.key), "0");
        await context.close();
        await visibleBrowser.close();
      });
      await run("fechar navegador inteiro e reabrir com perfil persistido", async () => {
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fin04-profile-"));
        let context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true });
        try {
          let page = context.pages()[0];
          await page.goto(origin + "/login");
          await page.getByLabel("E-mail", { exact: true }).fill("test@example.test");
          await page.getByLabel("Senha", { exact: true }).fill("test-password");
          await page.getByRole("button", { name: "Entrar", exact: true }).click();
          await page.getByTestId("protected").waitFor();
          const before = await state(page);
          await context.close();
          if (fast) await wait(32000);
          context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true });
          page = context.pages()[0];
          if (!fast) await page.clock.install({ time: Date.now() + 1800001 });
          await page.goto(origin + "/dashboard");
          await loggedOut(page);
          assert.equal(await page.evaluate((key) => localStorage.getItem(key), before.key), "0");
        } finally { await context.close(); }
      });
    }
  } finally {
    await Promise.all(extraBrowsers.map((browser) => browser.close()));
    await browser.close();
    server.closeAllConnections();
    server.close();
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ baseline, fast, report, logoutRequests, logs }, null, 2));
    console.log("Report:", path.join(output, "report.json"));
    if (report.some((item) => item.result === "FAIL")) process.exitCode = 1;
  }
})().catch((error) => { console.error(error); server.close(); process.exitCode = 1; });
