import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "app/components/closings/ClosingsPageContent.tsx",
  "utf8",
);
const closingServiceSource = readFileSync(
  "src/services/closingService.ts",
  "utf8",
);

test("fechamento carrega o status necessário para distinguir aplicação e resgate", () => {
  assert.ok(
    source.includes(
      '.select("account_id, destination_account_id, type, value, status, description")',
    ),
  );
});

test("lista e inicialização usam a mesma regra de conta transacional", () => {
  assert.ok(
    source.includes(
      "const cashAccounts = accounts.filter(requiresTraditionalAccountClosure);",
    ),
  );
  assert.ok(
    source.includes(
      "if (!requiresTraditionalAccountClosure(account as Account)) continue;",
    ),
  );
});

test("regra de conclusão também é validada no serviço de fechamento", () => {
  assert.ok(
    closingServiceSource.includes(
      "await validateCompetenceClosureRequirements(competenceId)",
    ),
  );
  assert.ok(closingServiceSource.includes("areRequiredClosuresComplete"));
});
