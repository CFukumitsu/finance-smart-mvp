"use client";

import { useState } from "react";
import AppShell from "../components/layout/AppShell";
import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import { ensureCompetencesExist } from "@/src/services/competenceService";
import * as XLSX from "xlsx";

type AccessAccount = {
  ID_PAGAMENTO: number;
  DS_PAGAMENTO: string;
  NR_VENCIMENTO?: number;
  NR_FECHAMENTO?: number;
};

type AccessCategory = {
  ID_TIPO_GASTO: number;
  DS_TIPO_GASTO: string;
  IN_ATIVO: boolean;
};

type AccessTransaction = {
  ID_TRANSACAO: number;
  DS_TRANSACAO: string;
  DT_TRANSACAO: string | number | Date;
  NR_VALOR: number;
  ID_PAGAMENTO: number;
  ST_OPERACAO: "D" | "C";
  NR_PARCELAS?: number;
  ID_TIPO_GASTO: number;
};

type ImportLog = {
  type: "success" | "error" | "info";
  message: string;
};

export default function ImportAccessPage() {
  const [pagamentoFile, setPagamentoFile] = useState<File | null>(null);
  const [tipoGastoFile, setTipoGastoFile] = useState<File | null>(null);
  const [transacaoFile, setTransacaoFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [logs, setLogs] = useState<ImportLog[]>([]);

  function addLog(type: ImportLog["type"], message: string) {
    setLogs((currentLogs) => [...currentLogs, { type, message }]);
  }

  function resetLogs() {
    setLogs([]);
  }

  async function readExcelFile<T>(file: File): Promise<T[]> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    return XLSX.utils.sheet_to_json<T>(sheet, {
      defval: null,
    });
  }

  function normalizeDate(value: string | number | Date) {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString().split("T")[0];
    }

    return date.toISOString().split("T")[0];
  }

  function getCompetenceName(dateString: string) {
    return dateString.slice(0, 7);
  }

  function getStatus(type: "Receita" | "Despesa", dueDate: string) {
    const today = new Date().toISOString().split("T")[0];

    if (dueDate > today) {
      return "Pendente";
    }

    return type === "Receita" ? "Recebido" : "Pago";
  }

  async function clearDatabase() {
    const confirmed = window.confirm(
      "Atenção: isso vai apagar lançamentos, competências, categorias e contas do banco atual. Confirma?"
    );

    if (!confirmed) return;

    setIsImporting(true);
    resetLogs();

    try {
      addLog("info", "Limpando base...");

      const tables = [
        "competence_closures",
        "recurring_transactions",
        "transactions",
        "competences",
        "categories",
        "accounts",
      ];

      for (const table of tables) {
        const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");

        if (error) {
          throw new Error(`Erro ao limpar ${table}: ${error.message}`);
        }

        addLog("success", `Tabela ${table} limpa.`);
      }

      addLog("success", "Base limpa com sucesso.");
    } catch (error) {
      console.error(error);
      addLog(
        "error",
        error instanceof Error ? error.message : "Erro ao limpar base."
      );
    } finally {
      setIsImporting(false);
    }
  }

  async function importAccessData() {
    if (!pagamentoFile || !tipoGastoFile || !transacaoFile) {
      alert("Selecione os três arquivos: PAGAMENTO, TIPOGASTO e TRANSACAO.");
      return;
    }

    const confirmed = window.confirm(
      "Confirma a importação? O ideal é limpar a base antes de importar."
    );

    if (!confirmed) return;

    setIsImporting(true);
    resetLogs();

    try {
      const ownerId = await getCurrentUserId();
      addLog("info", "Lendo arquivos Excel...");

      const accessAccounts = await readExcelFile<AccessAccount>(pagamentoFile);
      const accessCategories = await readExcelFile<AccessCategory>(tipoGastoFile);
      const accessTransactions = await readExcelFile<AccessTransaction>(transacaoFile);

      addLog("success", `${accessAccounts.length} contas/cartões encontrados.`);
      addLog("success", `${accessCategories.length} categorias encontradas.`);
      addLog("success", `${accessTransactions.length} transações encontradas.`);

      addLog("info", "Importando contas/cartões...");

      const accountPayload = accessAccounts.map((account) => {
        const closingDay = account.NR_FECHAMENTO
          ? Number(account.NR_FECHAMENTO)
          : null;

        const dueDay = account.NR_VENCIMENTO
          ? Number(account.NR_VENCIMENTO)
          : null;

        return {
          owner_id: ownerId,
          name: account.DS_PAGAMENTO,
          type: closingDay || dueDay ? "Cartão" : "Conta",
          closing_day: closingDay,
          due_day: dueDay,
          limit_amount: 0,
          current_balance: 0,
          active: true,
          legacy_id: Number(account.ID_PAGAMENTO),
        };
      });

      const { data: createdAccounts, error: accountsError } = await supabase
        .from("accounts")
        .insert(accountPayload)
        .select("id, legacy_id");

      if (accountsError) {
        throw new Error(`Erro ao importar contas: ${accountsError.message}`);
      }

      const accountIdByLegacyId = new Map<number, string>();

      (createdAccounts ?? []).forEach((account: any) => {
        accountIdByLegacyId.set(Number(account.legacy_id), account.id);
      });

      addLog("success", `${createdAccounts?.length ?? 0} contas/cartões importados.`);

      addLog("info", "Importando categorias...");

      const categoryPayload = [
        ...accessCategories.map((category) => ({
          owner_id: ownerId,
          name: category.DS_TIPO_GASTO,
          type: "Despesa",
          monthly_limit: 0,
          monthly_goal: 0,
          active: Boolean(category.IN_ATIVO),
          legacy_id: Number(category.ID_TIPO_GASTO),
        })),
        {
          owner_id: ownerId,
          name: "Sem categoria Access",
          type: "Despesa",
          monthly_limit: 0,
          monthly_goal: 0,
          active: true,
          legacy_id: 0,
        },
      ];

      const { data: createdCategories, error: categoriesError } = await supabase
        .from("categories")
        .insert(categoryPayload)
        .select("id, legacy_id");

      if (categoriesError) {
        throw new Error(`Erro ao importar categorias: ${categoriesError.message}`);
      }

      const categoryIdByLegacyId = new Map<number, string>();

      (createdCategories ?? []).forEach((category: any) => {
        categoryIdByLegacyId.set(Number(category.legacy_id), category.id);
      });

      addLog("success", `${createdCategories?.length ?? 0} categorias importadas.`);

      addLog("info", "Gerando competências...");

      const competenceNames = Array.from(
        new Set(
          accessTransactions.map((transaction) =>
            getCompetenceName(normalizeDate(transaction.DT_TRANSACAO))
          )
        )
      ).sort();

      const ensuredCompetences = await ensureCompetencesExist(competenceNames);
      const createdCompetences = Array.from(ensuredCompetences.values());

      const competenceIdByName = new Map<string, string>();

      createdCompetences.forEach((competence) => {
        competenceIdByName.set(competence.name, competence.id);
      });

      addLog("success", `${createdCompetences.length} competências preparadas.`);

      addLog("info", "Importando transações...");

      const transactionPayload = accessTransactions
      .map((transaction) => {
          const dueDate = normalizeDate(transaction.DT_TRANSACAO);
          const type =
            transaction.ST_OPERACAO === "C" ? "Receita" : "Despesa";

          return {
            owner_id: ownerId,
            description: transaction.DS_TRANSACAO,
            due_date: dueDate,
            value: Number(transaction.NR_VALOR ?? 0),
            type,
            mode: Number(transaction.NR_PARCELAS ?? 1) > 1 ? "parcelado" : "unico",
            status: getStatus(type, dueDate),
            account_id: accountIdByLegacyId.get(Number(transaction.ID_PAGAMENTO)),
            category_id: categoryIdByLegacyId.get(
              transaction.ID_TIPO_GASTO === null ||
                transaction.ID_TIPO_GASTO === undefined ||
                Number.isNaN(Number(transaction.ID_TIPO_GASTO))
                ? 0
                : Number(transaction.ID_TIPO_GASTO)
            ),
            competence_id: competenceIdByName.get(getCompetenceName(dueDate)),
            legacy_id: Number(transaction.ID_TRANSACAO),
          };
        })
        .filter(
          (transaction) =>
            transaction.account_id &&
            transaction.category_id &&
            transaction.competence_id
        );

      const batchSize = 500;

      for (let index = 0; index < transactionPayload.length; index += batchSize) {
        const batch = transactionPayload.slice(index, index + batchSize);

        const { error: transactionError } = await supabase
          .from("transactions")
          .insert(batch);

        if (transactionError) {
          throw new Error(
            `Erro ao importar transações no lote ${index / batchSize + 1}: ${transactionError.message}`
          );
        }

        addLog(
          "success",
          `Transações importadas: ${Math.min(
            index + batch.length,
            transactionPayload.length
          )}/${transactionPayload.length}`
        );
      }

      addLog("success", "Importação concluída com sucesso.");
    } catch (error) {
      console.error(error);
      addLog(
        "error",
        error instanceof Error ? error.message : "Erro durante a importação."
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Importar Access</h1>
          <p className="mt-1 text-sm text-slate-400">
            Importe os dados legados do Access para o Finance Smart.
          </p>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
          Antes de importar, faça backup do Supabase. A limpeza apaga contas,
          categorias, competências e lançamentos atuais.
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <p className="font-semibold text-white">PAGAMENTO.xlsx</p>
            <p className="mb-3 mt-1 text-xs text-slate-400">
              Contas e cartões
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) =>
                setPagamentoFile(event.target.files?.[0] ?? null)
              }
              className="text-sm text-slate-300"
            />
          </label>

          <label className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <p className="font-semibold text-white">TIPOGASTO.xlsx</p>
            <p className="mb-3 mt-1 text-xs text-slate-400">Categorias</p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) =>
                setTipoGastoFile(event.target.files?.[0] ?? null)
              }
              className="text-sm text-slate-300"
            />
          </label>

          <label className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <p className="font-semibold text-white">TRANSACAO.xlsx</p>
            <p className="mb-3 mt-1 text-xs text-slate-400">Lançamentos</p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) =>
                setTransacaoFile(event.target.files?.[0] ?? null)
              }
              className="text-sm text-slate-300"
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 md:flex-row">
          <button
            onClick={clearDatabase}
            disabled={isImporting}
            className="rounded-xl border border-red-500/30 px-5 py-3 font-semibold text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Limpar base
          </button>

          <button
            onClick={importAccessData}
            disabled={isImporting}
            className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isImporting ? "Processando..." : "Importar dados"}
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
          <h2 className="mb-4 text-lg font-bold text-white">Log da importação</h2>

          {logs.length === 0 && (
            <p className="text-sm text-slate-400">
              Nenhuma ação executada ainda.
            </p>
          )}

          <div className="space-y-2">
            {logs.map((log, index) => (
              <div
                key={`${log.message}-${index}`}
                className={`rounded-xl px-4 py-3 text-sm ${log.type === "success"
                    ? "bg-emerald-500/10 text-emerald-300"
                    : log.type === "error"
                      ? "bg-red-500/10 text-red-300"
                      : "bg-blue-500/10 text-blue-300"
                  }`}
              >
                {log.message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
