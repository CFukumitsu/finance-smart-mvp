/* eslint-disable @typescript-eslint/no-require-imports -- Node/webpack test harness uses CommonJS. */
const React = require("react");
let route = location.pathname;
const listeners = new Set();
function navigate(url) { history.pushState({}, "", url); route = location.pathname; listeners.forEach((fn) => fn()); }
exports.usePathname = () => React.useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => route);
exports.useRouter = () => ({ push: navigate, replace: navigate, refresh() {} });
exports.useSearchParams = () => new URLSearchParams(location.search);
window.automaticNavigation = navigate;
