/* eslint-disable @typescript-eslint/no-require-imports -- Node/webpack test harness uses CommonJS. */
const ts = require("typescript");
module.exports = function (source) {
  const original = source;
  if (this.resourcePath.endsWith("idleSession.ts")) {
    if (process.env.FIN04_FAST === "1") {
      source = source.replace("30 * 60 * 1000", "30 * 1000").replace("25 * 60 * 1000", "25 * 1000");
    }
    source = source.replace("let last = read();", 'let last = read(); console.debug("[FIN04 check]", JSON.stringify({ lastActivityAt: last, now: options.now(), elapsed: last === null ? null : options.now() - last, activity, reason: activity ? "interaction" : "passive-check" }));');
    source = source.replace('function expire() {', 'function expire() { console.debug("[FIN04 logout]", "expired");');
    source = source.replace('cancel = options.schedule', 'console.debug("[FIN04 timer]", JSON.stringify({ lastActivityAt: last, elapsed, warning })); cancel = options.schedule');
  }
  // Diagnostics exist only in this local test bundle; never in application source.
  if (source !== original) this.cacheable(false);
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
};
