/* eslint-disable @typescript-eslint/no-require-imports -- Node/webpack test harness uses CommonJS. */
const React = require("react");
const { createRoot } = require("react-dom/client");
const Provider = require("@/src/providers/AuthProvider").default;
const LoginForm = require("@/src/components/auth/LoginForm").default;
const { useAuth } = require("@/src/hooks/useAuth");
const { supabase } = require("@/src/lib/supabase");
const { signOut } = require("@/src/services/authService");
const idle = require("@/src/utils/idleSession");
window.testSupabase = supabase;
window.idleKey = (s) => idle.idleSessionKey(s);
window.timeouts = { warning: idle.IDLE_WARNING_TIME, logout: idle.IDLE_TIMEOUT };
window.testAuth = (event) => supabase.auth.getSession().then(({ data }) => supabase.auth._notifyAllSubscribers(event, data.session));
function App() {
  const { user } = useAuth();
  if (!user) return React.createElement(LoginForm);
  return React.createElement("main", { "data-testid": "protected" },
    React.createElement("h1", null, "Área autenticada de teste"),
    React.createElement("button", { onClick: () => {} }, "Interagir"),
    React.createElement("button", { onClick: () => window.automaticNavigation("/accounts") }, "Navegar"),
    React.createElement("button", { onClick: () => signOut() }, "Sair"));
}
createRoot(document.getElementById("root")).render(React.createElement(React.StrictMode, null, React.createElement(Provider, null, React.createElement(App))));
