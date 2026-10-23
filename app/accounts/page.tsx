"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Legacy page synchronizes Supabase reference data on mount. */


import { useMutation } from "@/src/hooks/useMutation";
import { ProcessingButton, MutationScope } from "@/src/components/ui/Mutation";
import FormDrawer from "@/src/components/ui/FormDrawer";
import { useEffect, useRef, useState } from "react";
import AppShell from "../components/layout/AppShell";
import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import { Pencil, TrendingUp, Power, Trash2 } from "lucide-react";
import {
  PLANNING_ROLE_LABELS,
  resolvePlanningRole,
  type PlanningRole,
} from "@/src/utils/financialOverview";
import {
  getAccountCardFields,
  type AccountFormType,
} from "@/src/utils/accountForm";
import {
  formatMoney,
  getMoneyInputPlaceholder,
  isSupportedCurrency,
  parseMoneyInput,
  SUPPORTED_CURRENCIES,
} from "@/src/utils/currencies";
import ViewModeToggle from "@/src/components/ui/viewMode/ViewModeToggle";
import { useViewMode } from "@/src/components/ui/viewMode/useViewMode";
import { confirmAction, notify } from "@/src/components/ui/feedback/feedbackStore";
import AccountIcon from "@/src/components/accounts/AccountIcon";
import AccountIconPicker from "@/src/components/accounts/AccountIconPicker";
import AccountImageField, {
  type AccountImageDraft,
} from "@/src/components/accounts/AccountImageField";
import { useAccountImageUrls } from "@/src/hooks/useAccountImageUrls";
import {
  removeAccountImageFiles,
  uploadAccountImage,
} from "@/src/services/accountImageService";
import {
  findAccountIconOption,
  getNextTransactionShortcutOrder,
  selectWithOptionalAccountColumns,
  parseTransactionShortcutOrder,
  resolveAccountIcon,
} from "@/src/utils/accountShortcuts";
import { isFinancialLedgerAccount } from "@/src/utils/closingAccounts";

type Competence = {
  id: string;
  name: string;
};

type Account = {
  id: string;
  name: string;
  type: "Conta" | "Cartão";
  closing_day: number | null;
  due_day: number | null;
  limit_amount: number | null;
  current_balance: number | null;
  currency: string | null;
  show_on_investments_dashboard: boolean;
  investment_account_kind: "BALANCE" | null;
  planning_role: PlanningRole | null;
  use_spending_history: boolean;
  spending_history_start_date: string | null;
  has_financial_history: boolean;
  active: boolean;
  // Ausentes enquanto a migration 202610230001 não for aplicada.
  icon_key?: string | null;
  show_in_transaction_shortcuts?: boolean;
  transaction_shortcut_order?: number | null;
  // Ausente enquanto a migration 202610230002 não for aplicada.
  image_path?: string | null;
};

const ACCOUNT_COLUMNS =
  "id, name, type, closing_day, due_day, limit_amount, current_balance, currency, show_on_investments_dashboard, investment_account_kind, planning_role, use_spending_history, spending_history_start_date, active";

const initialForm = {
  name: "",
  type: "Conta" as "Conta" | "Cartão",
  closing_day: "",
  due_day: "",
  limit_amount: "",
  current_balance: "",
  currency: "BRL",
  show_on_investments_dashboard: false,
  investment_account_kind: null as "BALANCE" | null,
  // Visão Financeira: "" = automático (resolvido pelo cadastro).
  planning_role: "" as PlanningRole | "",
  use_spending_history: true,
  spending_history_start_date: "",
  active: true,
  // Aparência e atalhos de Lançamentos (somente visual). "" = ícone automático.
  icon_key: "",
  show_in_transaction_shortcuts: false,
  transaction_shortcut_order: "",
};

export default function AccountsPage() {
  const mutation = useMutation();
  const {
    mode: viewMode,
    setMode: setViewMode,
    hasException: viewModeHasException,
    defaultMode: defaultViewMode,
  } = useViewMode("accounts");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [selectedCompetenceId, setSelectedCompetenceId] = useState("");
  const [plannedValue, setPlannedValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  // false = banco ainda sem as colunas de ícone/atalhos (migration pendente).
  const [shortcutsAvailable, setShortcutsAvailable] = useState(true);
  // false = banco ainda sem a coluna/bucket de imagem (migration pendente).
  const [imagesAvailable, setImagesAvailable] = useState(true);
  // Imagem escolhida no formulário: só é enviada ao salvar. removeImage marca
  // a remoção da imagem atual, também confirmada só ao salvar.
  const [imageDraft, setImageDraft] = useState<AccountImageDraft | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [planningAccount, setPlanningAccount] = useState<Account | null>(null);
  const [planningValues, setPlanningValues] = useState<Record<string, string>>(
    {},
  );
  const [isPlanningOpen, setIsPlanningOpen] = useState(false);
  const currentCompetenceRef = useRef<HTMLDivElement | null>(null);
  const currentDate = new Date();
  const currentCompetenceName = `${currentDate.getFullYear()}-${String(
    currentDate.getMonth() + 1,
  ).padStart(2, "0")}`;
  const [form, setForm] = useState(initialForm);
  const imageUrls = useAccountImageUrls(
    accounts.map((item) => item.image_path),
  );

  async function loadAccounts() {
    setIsLoading(true);
    setLoadError("");

    try {
      const ownerId = await getCurrentUserId();
      const selectAccounts = (columns: string) =>
        supabase
          .from("accounts")
          .select(columns)
          .eq("owner_id", ownerId)
          .order("active", { ascending: false })
          .order("type", { ascending: true })
          .order("name", { ascending: true });
      const [{ response: accountsResponse, available }, historyResponse] =
        await Promise.all([
          selectWithOptionalAccountColumns((optionalColumns) =>
            selectAccounts(`${ACCOUNT_COLUMNS}${optionalColumns}`),
          ),
          supabase.rpc("get_account_currency_history_flags"),
        ]);
      setShortcutsAvailable(available.shortcuts);
      setImagesAvailable(available.image);

      if (accountsResponse.error) {
        throw new Error(accountsResponse.error.message);
      }

      if (historyResponse.error) {
        throw new Error(historyResponse.error.message);
      }

      const accountsWithHistory = new Set(
        ((historyResponse.data ?? []) as { account_id: string }[]).map(
          (item) => item.account_id,
        ),
      );
      setAccounts(
        ((accountsResponse.data ?? []) as unknown as Omit<Account, "has_financial_history">[]).map(
          (account) => ({
            ...account,
            has_financial_history: accountsWithHistory.has(account.id),
          }),
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido.";
      console.error("Erro ao carregar contas/cartões:", error);
      setLoadError(message);
      notify.error("Erro ao carregar contas/cartões.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCompetences() {
    const ownerId = await getCurrentUserId();
    const { data } = await supabase
      .from("competences")
      .select("id, name")
      .eq("owner_id", ownerId)
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    setCompetences((data ?? []) as Competence[]);
  }

  useEffect(() => {
    loadAccounts();
    loadCompetences();
  }, []);

  function changeImageDraft(draft: AccountImageDraft | null) {
    setImageDraft((current) => {
      if (current && current.previewUrl !== draft?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return draft;
    });
  }

  function resetForm() {
    setEditingAccountId(null);
    setForm(initialForm);
    changeImageDraft(null);
    setRemoveImage(false);

    setSelectedCompetenceId("");
    setPlannedValue("");
  }

  function openNewDrawer() {
    resetForm();
    setIsDrawerOpen(true);
  }

  function openEditDrawer(account: Account) {
    setEditingAccountId(account.id);
    changeImageDraft(null);
    setRemoveImage(false);
    const isCard = account.type === "Cartão";
    setForm({
      name: account.name ?? "",
      type: account.type ?? "Conta",
      closing_day:
        isCard && account.closing_day ? String(account.closing_day) : "",
      due_day: isCard && account.due_day ? String(account.due_day) : "",
      limit_amount: account.limit_amount ? String(account.limit_amount) : "",
      current_balance: account.current_balance
        ? String(account.current_balance)
        : "",
      currency: account.currency ?? "",
      show_on_investments_dashboard:
        account.show_on_investments_dashboard ?? false,
      investment_account_kind: account.investment_account_kind ?? null,
      planning_role: account.planning_role ?? "",
      use_spending_history: account.use_spending_history ?? true,
      spending_history_start_date: account.spending_history_start_date ?? "",
      active: account.active,
      icon_key: account.icon_key ?? "",
      show_in_transaction_shortcuts: account.show_in_transaction_shortcuts ?? false,
      transaction_shortcut_order: account.transaction_shortcut_order
        ? String(account.transaction_shortcut_order)
        : "",
    });
    setIsDrawerOpen(true);
  }

  function handleShortcutToggle(checked: boolean) {
    setForm((current) => ({
      ...current,
      show_in_transaction_shortcuts: checked,
      transaction_shortcut_order:
        checked && !current.transaction_shortcut_order
          ? String(getNextTransactionShortcutOrder(accounts, editingAccountId))
          : current.transaction_shortcut_order,
    }));
  }

  async function openPlanningModal(account: Account) {
    const ownerId = await getCurrentUserId();
    setPlanningAccount(account);
    setIsPlanningOpen(true);

    const { data, error } = await supabase
      .from("financial_targets")
      .select("competence_id, planned_value")
      .eq("target_type", "account")
      .eq("owner_id", ownerId)
      .eq("target_id", account.id);

    if (error) {
      console.error("Erro ao carregar planejamento:", error);
      notify.error("Erro ao carregar planejamento mensal.");
      return;
    }

    const mappedValues: Record<string, string> = {};

    (data ?? []).forEach((item) => {
      mappedValues[item.competence_id] = formatPlannedValue(
        item.planned_value,
        account.currency,
      );
    });

    setPlanningValues(mappedValues);

    setTimeout(() => {
      requestAnimationFrame(() => {
        currentCompetenceRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    }, 300);
  }

  function closePlanningModal() {
    setPlanningAccount(null);
    setPlanningValues({});
    setIsPlanningOpen(false);
  }

  async function savePlanning() {
    return mutation.run("savePlanning", async () => {

    const ownerId = await getCurrentUserId();
    if (!planningAccount) return;

    const rows = Object.entries(planningValues)
      .filter(([, value]) => value !== "")
      .map(([competenceId, value]) => ({
        owner_id: ownerId,
        competence_id: competenceId,
        target_type: "account",
        target_id: planningAccount.id,
        planned_value: parseMoneyInput(value),
        updated_at: new Date().toISOString(),
      }));

    const { error } = await supabase.from("financial_targets").upsert(rows, {
      onConflict: "owner_id,competence_id,target_type,target_id",
    });

    if (error) {
      console.error("Erro ao salvar planejamento:", error);

      notify.error(
        `Erro ao salvar planejamento:\n\n${error.message}\n\n${error.details ?? ""}`,
      );

      return;
    }

    closePlanningModal();

    });
  }

  // Papel que valerá se o campo ficar em "Automático" (mesma regra da Visão Financeira).
  const automaticPlanningRole = resolvePlanningRole({
    id: editingAccountId ?? "new",
    name: form.name,
    type: form.type,
    currency: form.currency,
    current_balance: null,
    active: form.active,
    show_on_investments_dashboard:
      form.investment_account_kind === "BALANCE" || form.show_on_investments_dashboard,
    investment_account_kind: form.investment_account_kind,
    planning_role: null,
  });
  const effectivePlanningRole: PlanningRole =
    form.planning_role || automaticPlanningRole;

  // Ícone automático e elegibilidade aos atalhos seguem o cadastro atual do
  // formulário. Lançamentos lista só contas/cartões movimentáveis por ele.
  const formAccountClassification = {
    id: editingAccountId ?? "new",
    type: form.type,
    currency: form.currency,
    show_on_investments_dashboard:
      form.investment_account_kind === "BALANCE" || form.show_on_investments_dashboard,
    investment_account_kind: form.investment_account_kind,
  };
  const automaticIconOption = resolveAccountIcon(formAccountClassification);
  const canShowInShortcuts = isFinancialLedgerAccount(formAccountClassification);

  function closeDrawer() {
    resetForm();
    setIsDrawerOpen(false);
  }

  function handleAccountTypeChange(type: AccountFormType) {
    setForm((current) => ({
      ...current,
      type,
      closing_day: type === "Conta" ? "" : current.closing_day,
      due_day: type === "Conta" ? "" : current.due_day,
      investment_account_kind:
        type === "Cartão" ? null : current.investment_account_kind,
    }));
  }

  async function saveAccount() {
    return mutation.run("saveAccount", async () => {

    const ownerId = await getCurrentUserId();
    if (!form.name || !form.type || !form.currency) {
      notify.warning(
        !form.currency
          ? "Confirme a moeda desta conta antes de salvar."
          : "Preencha nome e tipo.",
      );
      return;
    }

    const cardFields = getAccountCardFields(
      form.type,
      form.closing_day,
      form.due_day,
    );
    const shortcutOrder = parseTransactionShortcutOrder(
      form.transaction_shortcut_order,
    );
    const showInShortcuts =
      form.show_in_transaction_shortcuts && canShowInShortcuts;
    if (showInShortcuts && shortcutOrder === null) {
      notify.warning("Informe a ordem do atalho com um número de 1 a 999.");
      return;
    }
    // Só visual; omitido enquanto o banco não tiver as colunas (migration).
    const shortcutFields: Partial<
      Pick<
        Account,
        "icon_key" | "show_in_transaction_shortcuts" | "transaction_shortcut_order"
      >
    > = shortcutsAvailable
      ? {
          icon_key: form.icon_key || null,
          show_in_transaction_shortcuts: showInShortcuts,
          transaction_shortcut_order: showInShortcuts ? shortcutOrder : null,
        }
      : {};
    const payload = {
      owner_id: ownerId,
      name: form.name.trim(),
      type: form.type,
      ...cardFields,
      limit_amount: form.limit_amount ? Number(form.limit_amount) : 0,
      current_balance:
        form.investment_account_kind === "BALANCE"
          ? 0
          : form.current_balance
            ? Number(form.current_balance)
            : 0,
      currency: form.currency.trim().toUpperCase(),
      show_on_investments_dashboard:
        form.investment_account_kind === "BALANCE"
          ? true
          : form.show_on_investments_dashboard,
      investment_account_kind: form.investment_account_kind,
      planning_role: form.planning_role || null,
      use_spending_history: form.use_spending_history,
      spending_history_start_date: form.spending_history_start_date || null,
      active: form.active,
      ...shortcutFields,
      updated_at: new Date().toISOString(),
    };

    // Imagem (só visual). Na edição, a nova imagem é enviada ANTES de salvar
    // o cadastro, num arquivo novo; a anterior só é apagada depois que o
    // cadastro apontar para a nova. Se o cadastro falhar, o arquivo novo sai.
    const previousImagePath = editingAccount?.image_path ?? null;
    let uploadedImagePath: string | null = null;
    if (editingAccountId && imagesAvailable && imageDraft) {
      try {
        uploadedImagePath = await uploadAccountImage(editingAccountId, imageDraft.file);
      } catch (uploadError) {
        console.error("Erro ao enviar imagem da conta:", uploadError);
        notify.error(
          `Não foi possível enviar a imagem. Nada foi alterado. ${
            uploadError instanceof Error ? uploadError.message : ""
          }`.trim(),
        );
        return;
      }
    }
    const imageFields =
      editingAccountId && imagesAvailable && (uploadedImagePath || removeImage)
        ? { image_path: uploadedImagePath }
        : {};

    const { data: savedAccount, error } = editingAccountId
      ? await supabase
          .from("accounts")
          .update({ ...payload, ...imageFields })
          .eq("id", editingAccountId)
          .eq("owner_id", ownerId)
          .select("id")
          .single()
      : await supabase.from("accounts").insert(payload).select("id").single();

    if (error) {
      console.error("Erro ao salvar conta/cartão:", error);
      if (uploadedImagePath) {
        await removeAccountImageFiles([uploadedImagePath], editingAccountId ?? undefined).catch(
          (cleanupError) => console.error("Erro ao descartar imagem não usada:", cleanupError),
        );
      }
      notify.error(error.message);
      return;
    }

    if (
      editingAccountId &&
      "image_path" in imageFields &&
      previousImagePath &&
      previousImagePath !== uploadedImagePath
    ) {
      // Cadastro já aponta para a nova imagem (ou para nenhuma): a antiga sai.
      await removeAccountImageFiles([previousImagePath], editingAccountId).catch(
        (cleanupError) => console.error("Erro ao remover imagem anterior:", cleanupError),
      );
    }

    // Conta nova: o arquivo só pode ser enviado com a conta já criada (a
    // política do Storage confere o dono da conta).
    if (!editingAccountId && imagesAvailable && imageDraft) {
      let newPath: string | null = null;
      try {
        newPath = await uploadAccountImage(savedAccount.id, imageDraft.file);
        const { error: imageError } = await supabase
          .from("accounts")
          .update({ image_path: newPath })
          .eq("id", savedAccount.id)
          .eq("owner_id", ownerId);
        if (imageError) throw new Error(imageError.message);
      } catch (imageError) {
        console.error("Erro ao salvar imagem da nova conta:", imageError);
        if (newPath) {
          await removeAccountImageFiles([newPath], savedAccount.id).catch(() => undefined);
        }
        notify.warning(
          "Conta/cartão salvo, mas a imagem não foi enviada. Edite o cadastro para tentar de novo.",
        );
      }
    }

    if (selectedCompetenceId && plannedValue) {
      const { error: targetError } = await supabase
        .from("financial_targets")
        .upsert(
          {
            owner_id: ownerId,
            competence_id: selectedCompetenceId,
            target_type: "account",
            target_id: savedAccount.id,
            planned_value: Number(plannedValue),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "owner_id,competence_id,target_type,target_id",
          },
        );

      if (targetError) {
        console.error("Erro ao salvar planejamento:", targetError);
        notify.error("Conta/cartão salvo, mas houve erro ao salvar o planejamento.");
        return;
      }
    }

    closeDrawer();
    await loadAccounts();

    });
  }

  async function toggleActive(account: Account) {
    return mutation.run("toggleActive" + ":" + (account).id, async () => {

    const ownerId = await getCurrentUserId();
    const { error } = await supabase
      .from("accounts")
      .update({
        active: !account.active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id)
      .eq("owner_id", ownerId);

    if (error) {
      console.error("Erro ao alterar status:", error);
      notify.error(error.message);
      return;
    }

    await loadAccounts();

    });
  }

  async function deleteAccount(account: Account) {
    return mutation.run("deleteAccount" + ":" + (account).id, async () => {

    const ownerId = await getCurrentUserId();
    const confirmed = await confirmAction({
      title: "Excluir conta/cartão",
      message: `Tem certeza que deseja excluir "${account.name}"? Se já existir lançamento usando essa conta/cartão, o banco pode bloquear.`,
      tone: "danger",
      confirmLabel: "Excluir",
    });

    if (!confirmed) return;

    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", account.id)
      .eq("owner_id", ownerId);

    if (error) {
      console.error("Erro ao excluir conta/cartão:", error);
      notify.error(
        "Não foi possível excluir. Use Inativar se já houver lançamentos vinculados.",
      );
      return;
    }

    // Conta excluída: a imagem dela (só da pasta do usuário/conta) sai junto.
    if (account.image_path) {
      await removeAccountImageFiles([account.image_path], account.id).catch(
        (cleanupError) => console.error("Erro ao remover imagem da conta excluída:", cleanupError),
      );
    }

    await loadAccounts();

    });
  }

  // O planejamento de uma conta é expresso na moeda nativa dessa conta.
  function formatPlannedValue(
    value: string | number | null,
    currency: string | null | undefined,
  ) {
    const numberValue = Number(value ?? 0);

    if (!numberValue) return "";

    return formatMoney(numberValue, currency);
  }

  function handlePlanningValueChange(competenceId: string, value: string) {
    const numericValue = parseMoneyInput(value);

    setPlanningValues({
      ...planningValues,
      [competenceId]: numericValue
        ? formatPlannedValue(numericValue, planningAccount?.currency)
        : "",
    });
  }

  const editingAccount = accounts.find(
    (account) => account.id === editingAccountId,
  );
  const currencyLocked = Boolean(
    editingAccount?.currency && editingAccount.has_financial_history,
  );
  const investmentKindLocked = Boolean(
    editingAccount?.has_financial_history || editingAccount?.investment_account_kind,
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Contas e Cartões</h1>
            <p className="mt-1 text-sm text-slate-400">
              Cadastre contas bancárias, cartões e saldos iniciais.
            </p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            {/* No celular a tela usa sempre cartões (a tabela tem 1100px). */}
            <div className="hidden md:block">
              <ViewModeToggle
                mode={viewMode}
                onChange={setViewMode}
                hasException={viewModeHasException}
                defaultMode={defaultViewMode}
              />
            </div>

            <button disabled={mutation.isPending}
              onClick={openNewDrawer}
              className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 md:w-auto"
            >
              Nova conta/cartão
            </button>
          </div>
        </div>

        {loadError && !isLoading && (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200"
          >
            Não foi possível carregar contas/cartões: {loadError}
          </div>
        )}

        <div
          className={
            viewMode === "cards"
              ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3 min-[1600px]:grid-cols-4"
              : "grid gap-3 md:hidden"
          }
        >
          {isLoading && (
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 text-center text-sm text-slate-400 md:col-span-full">
              Carregando contas/cartões...
            </div>
          )}

          {!isLoading &&
            accounts.map((account) => (
              <div
                key={account.id}
                className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <AccountIcon
                      option={resolveAccountIcon(account)}
                      imageUrl={account.image_path ? imageUrls[account.image_path] : null}
                    />
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold text-white">{account.name}</h3>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            account.type === "Conta"
                              ? "bg-blue-500/10 text-blue-300"
                              : "bg-purple-500/10 text-purple-300"
                          }`}
                        >
                          {account.type}
                        </span>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            account.active
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-slate-500/10 text-slate-400"
                          }`}
                        >
                          {account.active ? "Ativa" : "Inativa"}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${account.currency ? "bg-cyan-500/10 text-cyan-300" : "bg-amber-500/10 text-amber-200"}`}
                        >
                          {account.currency ?? "Moeda não confirmada"}
                        </span>
                        {account.investment_account_kind === "BALANCE" && (
                          <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">
                            Investimento por saldo
                          </span>
                        )}
                        {account.show_in_transaction_shortcuts && (
                          <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-300">
                            Atalho{account.transaction_shortcut_order ? ` ${account.transaction_shortcut_order}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      title="Planejamento"
                      aria-label="Planejamento"
                      onClick={() => openPlanningModal(account)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400"
                    >
                      <TrendingUp size={16} />
                    </button>

                    <button disabled={mutation.isPending}
                      title="Editar"
                      aria-label="Editar"
                      onClick={() => openEditDrawer(account)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400"
                    >
                      <Pencil size={16} />
                    </button>

                    <ProcessingButton busy={mutation.pending === ("toggleActive" + ":" + (account).id)} disabled={mutation.isPending}
                      title={account.active ? "Inativar" : "Ativar"}
                      aria-label={account.active ? "Inativar" : "Ativar"}
                      onClick={() => toggleActive(account)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-500/20 bg-slate-500/10 text-slate-300"
                    >
                      <Power size={16} />
                    </ProcessingButton>

                    <ProcessingButton busy={mutation.pending === ("deleteAccount" + ":" + (account).id)} disabled={mutation.isPending}
                      title="Excluir"
                      aria-label="Excluir"
                      onClick={() => deleteAccount(account)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400"
                    >
                      <Trash2 size={16} />
                    </ProcessingButton>
                  </div>
                </div>

                {/* Fechamento e vencimento só existem para cartões. */}
                {(account.closing_day || account.due_day) && (
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <p className="text-xs text-slate-500">Fechamento</p>
                    <p className="mt-1 font-semibold text-slate-200">
                      {account.closing_day ? `Dia ${account.closing_day}` : "-"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <p className="text-xs text-slate-500">Vencimento</p>
                    <p className="mt-1 font-semibold text-slate-200">
                      {account.due_day ? `Dia ${account.due_day}` : "-"}
                    </p>
                  </div>
                </div>
                )}
              </div>
            ))}

          {!isLoading && accounts.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 text-center text-sm text-slate-400 md:col-span-full">
              Nenhuma conta/cartão cadastrada.
            </div>
          )}
        </div>

        <div
          className={`${viewMode === "cards" ? "hidden" : "hidden md:block"} w-full overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60`}
        >
          <table className="finance-table-compact min-w-[1100px] w-full text-left text-sm">
            <thead className="bg-white/5 text-slate-300">
              <tr>
                <th className="px-5 py-4">Nome</th>
                <th className="px-5 py-4">Tipo</th>
                <th className="px-5 py-4">Moeda</th>
                <th className="px-5 py-4">Fechamento</th>
                <th className="px-5 py-4">Vencimento</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/10">
              {isLoading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-slate-400"
                  >
                    Carregando contas/cartões...
                  </td>
                </tr>
              )}

              {!isLoading &&
                accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-white/[0.03]">
                    <td className="px-5 py-4 font-medium text-white">
                      <div className="flex items-center gap-3">
                        <AccountIcon
                          option={resolveAccountIcon(account)}
                          size="sm"
                          imageUrl={account.image_path ? imageUrls[account.image_path] : null}
                        />
                        <span className="min-w-0">{account.name}</span>
                        {account.show_in_transaction_shortcuts && (
                          <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                            Atalho{account.transaction_shortcut_order ? ` ${account.transaction_shortcut_order}` : ""}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      <div>{account.type}</div>
                      {account.investment_account_kind === "BALANCE" && (
                        <span className="mt-1 inline-flex rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                          Investimento por saldo
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-5 py-4 ${account.currency ? "text-slate-300" : "font-semibold text-amber-200"}`}
                    >
                      {account.currency ?? "Não confirmada"}
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      {account.closing_day ? `Dia ${account.closing_day}` : "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      {account.due_day ? `Dia ${account.due_day}` : "-"}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          account.active
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-slate-500/10 text-slate-400"
                        }`}
                      >
                        {account.active ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          title="Planejamento"
                          aria-label="Planejamento"
                          onClick={() => openPlanningModal(account)}
                          className="
        flex h-10 w-10 items-center justify-center
        rounded-xl
        border border-cyan-500/20
        bg-cyan-500/10
        text-cyan-400
        transition-all duration-200
        hover:scale-105
        hover:border-cyan-400/40
        hover:bg-cyan-500/20
        hover:text-cyan-300
      "
                        >
                          <TrendingUp size={18} />
                        </button>

                        <button disabled={mutation.isPending}
                          title="Editar"
                          aria-label="Editar"
                          onClick={() => openEditDrawer(account)}
                          className="
        flex h-10 w-10 items-center justify-center
        rounded-xl
        border border-amber-500/20
        bg-amber-500/10
        text-amber-400
        transition-all duration-200
        hover:scale-105
        hover:border-amber-400/40
        hover:bg-amber-500/20
        hover:text-amber-300
      "
                        >
                          <Pencil size={18} />
                        </button>

                        <ProcessingButton busy={mutation.pending === ("toggleActive" + ":" + (account).id)} disabled={mutation.isPending}
                          title={account.active ? "Inativar" : "Ativar"}
                          aria-label={account.active ? "Inativar" : "Ativar"}
                          onClick={() => toggleActive(account)}
                          className="
        flex h-10 w-10 items-center justify-center
        rounded-xl
        border border-slate-500/20
        bg-slate-500/10
        text-slate-300
        transition-all duration-200
        hover:scale-105
        hover:border-slate-400/40
        hover:bg-slate-500/20
        hover:text-white
      "
                        >
                          <Power size={18} />
                        </ProcessingButton>

                        <ProcessingButton busy={mutation.pending === ("deleteAccount" + ":" + (account).id)} disabled={mutation.isPending}
                          title="Excluir"
                          aria-label="Excluir"
                          onClick={() => deleteAccount(account)}
                          className="
        flex h-10 w-10 items-center justify-center
        rounded-xl
        border border-red-500/20
        bg-red-500/10
        text-red-400
        transition-all duration-200
        hover:scale-105
        hover:border-red-400/40
        hover:bg-red-500/20
        hover:text-red-300
      "
                        >
                          <Trash2 size={18} />
                        </ProcessingButton>
                      </div>
                    </td>
                  </tr>
                ))}

              {!isLoading && accounts.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-slate-400"
                  >
                    Nenhuma conta/cartão cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isDrawerOpen && (
        <MutationScope busy={mutation.isPending} isLocked={mutation.isLocked}>
          <FormDrawer
            title={editingAccountId ? "Editar conta/cartão" : "Nova conta/cartão"}
            description="Configure os dados da conta ou cartão."
            onClose={closeDrawer}
            footer={
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="w-full rounded-xl border border-white/10 px-5 py-3 font-semibold text-white hover:bg-white/10"
                >
                  Cancelar
                </button>

                <ProcessingButton busy={mutation.pending === ("saveAccount")} disabled={mutation.isPending}
                  type="button"
                  onClick={saveAccount}
                  className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500"
                >
                  {editingAccountId ? "Atualizar" : "Salvar"}
                </ProcessingButton>
              </div>
            }
          >
            <div className="space-y-4">
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="Nome"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

              <select
                value={form.type}
                onChange={(event) =>
                  handleAccountTypeChange(
                    event.target.value as AccountFormType,
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              >
                <option value="Conta">Conta</option>
                <option value="Cartão">Cartão</option>
              </select>

              <label className="space-y-1 text-sm text-slate-300">
                <span>Moeda</span>
                <select
                  value={form.currency}
                  disabled={currencyLocked}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      currency: event.target.value.toUpperCase(),
                    })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                >
                  <option value="">Selecione e confirme</option>
                  {SUPPORTED_CURRENCIES.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} — {currency.label}
                    </option>
                  ))}
                  {form.currency && !isSupportedCurrency(form.currency) && (
                    <option value={form.currency}>{form.currency}</option>
                  )}
                </select>
                {!form.currency && (
                  <span className="block text-xs text-amber-200">
                    Confirme a moeda desta conta antes de utilizá-la em
                    integrações.
                  </span>
                )}
                {currencyLocked && (
                  <span className="block text-xs text-slate-400">
                    A moeda desta conta não pode ser alterada porque ela já
                    possui histórico financeiro.
                  </span>
                )}
              </label>

              <div className="space-y-3 rounded-2xl border border-blue-400/20 bg-blue-500/5 p-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Aparência e atalhos
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Escolha apenas visual: não altera tipo, moeda ou cálculos.
                  </p>
                </div>

                {!shortcutsAvailable && (
                  <p
                    role="status"
                    className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                  >
                    Ícone e atalhos ficam disponíveis depois que a atualização
                    do banco (migration 202610230001) for aplicada.
                  </p>
                )}

                {imagesAvailable ? (
                  <AccountImageField
                    savedImageUrl={
                      editingAccount?.image_path
                        ? (imageUrls[editingAccount.image_path] ?? null)
                        : null
                    }
                    hasSavedImage={Boolean(editingAccount?.image_path)}
                    draft={imageDraft}
                    onDraftChange={changeImageDraft}
                    removeSaved={removeImage}
                    onRemoveSavedChange={setRemoveImage}
                    iconOption={
                      findAccountIconOption(form.icon_key) ?? automaticIconOption
                    }
                  />
                ) : (
                  <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    O envio de imagem fica disponível depois que a atualização
                    do banco e do Storage (migration 202610230002) for aplicada.
                  </p>
                )}

                <AccountIconPicker
                  value={form.icon_key}
                  automaticOption={automaticIconOption}
                  onChange={(iconKey) => setForm({ ...form, icon_key: iconKey })}
                  disabled={!shortcutsAvailable}
                />

                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.show_in_transaction_shortcuts && canShowInShortcuts}
                    disabled={!shortcutsAvailable || !canShowInShortcuts}
                    onChange={(event) => handleShortcutToggle(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-semibold text-white">
                      Exibir nos atalhos de Lançamentos
                    </span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {canShowInShortcuts
                        ? "Mostra o card desta conta/cartão acima da lista de lançamentos, como filtro rápido."
                        : "Contas de investimento são movimentadas pelo módulo Investimentos e não aparecem em Lançamentos."}
                    </span>
                  </span>
                </label>

                {form.show_in_transaction_shortcuts && canShowInShortcuts && (
                  <label className="block space-y-1 text-sm text-slate-300">
                    <span>Ordem de exibição</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={999}
                      step={1}
                      value={form.transaction_shortcut_order}
                      disabled={!shortcutsAvailable}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          transaction_shortcut_order: event.target.value,
                        })
                      }
                      className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                    />
                    <span className="block text-xs text-slate-400">
                      1 aparece primeiro. Números iguais seguem o nome.
                    </span>
                  </label>
                )}
              </div>

              {form.type === "Conta" && (
                <label className="flex items-start gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.investment_account_kind === "BALANCE"}
                    disabled={investmentKindLocked}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        investment_account_kind: event.target.checked
                          ? "BALANCE"
                          : null,
                        show_on_investments_dashboard: event.target.checked
                          ? true
                          : form.show_on_investments_dashboard,
                        current_balance: event.target.checked
                          ? ""
                          : form.current_balance,
                      })
                    }
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-semibold text-white">
                      Conta de investimento por saldo
                    </span>
                    <span className="mt-1 block text-xs text-slate-400">
                      O saldo será calculado exclusivamente por Saldo inicial,
                      Aplicações, Resgates, Rendimentos e Ajustes. O saldo inicial
                      comum da conta permanecerá zero.
                    </span>
                    {investmentKindLocked && (
                      <span className="mt-1 block text-xs text-amber-200">
                        A finalidade não pode ser alterada depois que a conta possui histórico.
                      </span>
                    )}
                  </span>
                </label>
              )}

              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Exibição no dashboard de investimentos
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Escolha se esta conta ou cartão deverá aparecer no módulo
                    de investimentos.
                  </p>
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.show_on_investments_dashboard}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        show_on_investments_dashboard: event.target.checked,
                      })
                    }
                    className="mt-0.5"
                  />

                  <span>
                    <span className="block font-semibold text-white">
                      Mostrar no dashboard de investimentos
                    </span>
                    <span className="mt-1 block text-xs text-slate-400">
                      Disponibiliza esta conta para o módulo de investimentos.
                    </span>
                  </span>
                </label>
              </div>

              {form.type === "Cartão" && (
                <>
                  <input
                    value={form.closing_day}
                    onChange={(event) =>
                      setForm({ ...form, closing_day: event.target.value })
                    }
                    placeholder="Dia de fechamento, se cartão"
                    type="number"
                    min={1}
                    max={31}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                  />

                  <input
                    value={form.due_day}
                    onChange={(event) =>
                      setForm({ ...form, due_day: event.target.value })
                    }
                    placeholder="Dia de vencimento, se cartão"
                    type="number"
                    min={1}
                    max={31}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                  />
                </>
              )}

              <div className="space-y-3 rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Visão Financeira
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Como esta {form.type === "Cartão" ? "conta/cartão" : "conta"} participa do
                    planejamento (Pode guardar, guardado e reserva).
                  </p>
                </div>

                <label className="block space-y-1 text-sm text-slate-300">
                  <span>Papel no planejamento</span>
                  <select
                    value={form.planning_role}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        planning_role: event.target.value as PlanningRole | "",
                      })
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                  >
                    <option value="">
                      {`Automático (${PLANNING_ROLE_LABELS[automaticPlanningRole]})`}
                    </option>
                    <option value="operational">{PLANNING_ROLE_LABELS.operational}</option>
                    {form.type === "Conta" && (
                      <option value="savings">{PLANNING_ROLE_LABELS.savings}</option>
                    )}
                    <option value="excluded">{PLANNING_ROLE_LABELS.excluded}</option>
                  </select>
                  <span className="block text-xs text-slate-400">
                    Operacional: o saldo conta como disponível. Reserva/investimento:
                    transferências para cá viram &quot;guardado&quot;. Nada depende do nome da conta.
                  </span>
                </label>

                {form.type === "Conta" && effectivePlanningRole === "operational" && (
                  <>
                    <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={form.use_spending_history}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            use_spending_history: event.target.checked,
                          })
                        }
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block font-semibold text-white">
                          Usar no cálculo da reserva
                        </span>
                        <span className="mt-1 block text-xs text-slate-400">
                          Os gastos variáveis (débito/Pix) desta conta estimam quanto
                          reservar até o fim do mês. Desmarque para contas só de
                          despesas fixas.
                        </span>
                      </span>
                    </label>

                    {form.use_spending_history && (
                      <label className="block space-y-1 text-sm text-slate-300">
                        <span>Usar histórico a partir de (opcional)</span>
                        <input
                          type="date"
                          value={form.spending_history_start_date}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              spending_history_start_date: event.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                        />
                        <span className="block text-xs text-slate-400">
                          Use quando o jeito de usar a conta mudou: o histórico
                          anterior a esta data é ignorado.
                        </span>
                      </label>
                    )}
                  </>
                )}
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    setForm({ ...form, active: event.target.checked })
                  }
                />
                Ativa
              </label>
            </div>
          </FormDrawer>
        </MutationScope>
      )}
      {isPlanningOpen && planningAccount && (
        <MutationScope busy={mutation.isPending} isLocked={mutation.isLocked}>
          <FormDrawer
            title="Planejamento mensal"
            description={planningAccount.name}
            onClose={closePlanningModal}
            footer={
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closePlanningModal}
                  className="w-full rounded-xl border border-white/10 px-5 py-3 font-semibold text-white hover:bg-white/10"
                >
                  Cancelar
                </button>

                <ProcessingButton busy={mutation.pending === ("savePlanning")} disabled={mutation.isPending}
                  type="button"
                  onClick={savePlanning}
                  className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500"
                >
                  Salvar planejamento
                </ProcessingButton>
              </div>
            }
          >
              <div className="space-y-3">
                {competences.map((competence) => (
                  <div
                    key={competence.id}
                    ref={
                      competence.name === currentCompetenceName
                        ? currentCompetenceRef
                        : null
                    }
                    className={`grid grid-cols-1 gap-3 rounded-2xl border p-4 md:grid-cols-[1fr_220px] ${
                      competence.name === currentCompetenceName
                        ? "border-cyan-500/40 bg-cyan-500/10"
                        : "border-white/10 bg-slate-900/70"
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-white">
                        {competence.name}
                      </p>
                      <p className="text-xs text-slate-500">Valor planejado</p>
                    </div>

                    <input
                      value={planningValues[competence.id] ?? ""}
                      onChange={(event) =>
                        handlePlanningValueChange(
                          competence.id,
                          event.target.value,
                        )
                      }
                      type="text"
                      inputMode="numeric"
                      placeholder={getMoneyInputPlaceholder(
                        planningAccount.currency,
                      )}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-right text-white outline-none focus:border-cyan-400/50"
                    />
                  </div>
                ))}
              </div>
          </FormDrawer>
        </MutationScope>
      )}
    </AppShell>
  );
}
