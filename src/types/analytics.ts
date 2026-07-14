export type AnalyticsAccount = {
  id: string;
  name: string;
  type: "Conta" | "Cartão";
  active: boolean;
};

export type AnalyticsCategory = {
  id: string;
  name: string;
  type: "Receita" | "Despesa" | "Transferência";
  active: boolean;
};

export type AnalyticsCompetence = {
  id: string;
  name: string;
  month: number;
  year: number;
};

export type AnalyticsTransaction = {
  id: string;
  competence_id: string;
  account_id: string | null;
  category_id: string | null;
  origin_account_id: string | null;
  destination_account_id: string | null;
  description: string;
  due_date: string;
  type: "Receita" | "Despesa" | "Transferência" | "Pagamento de Fatura";
  value: number;
  status: "Pendente" | "Pago" | "Recebido";
  account: Pick<AnalyticsAccount, "name" | "type"> | null;
  category: Pick<AnalyticsCategory, "name" | "type"> | null;
};

export type AnalyticsFilters = {
  competenceId: string;
  accountId: string;
  categoryId: string;
  status: string;
};

export type AnalyticsDataset = {
  transactions: AnalyticsTransaction[];
  openingBalance: number;
};

export type AnalyticsReferenceData = {
  accounts: AnalyticsAccount[];
  categories: AnalyticsCategory[];
  competences: AnalyticsCompetence[];
};

export type MonthlyAnalytics = {
  competenceId: string;
  competenceName: string;
  monthLabel: string;
  income: number;
  expenses: number;
  balance: number;
  cumulativeBalance: number;
  cashIn: number;
  cashOut: number;
  cashBalance: number;
  cumulativeCashBalance: number;
};

export type AnalyticsBreakdown = {
  id: string;
  name: string;
  value: number;
  count: number;
};

export type AnalyticsScreenKind =
  | "overview"
  | "income"
  | "expenses"
  | "cash-flow";
