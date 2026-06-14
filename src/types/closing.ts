export type ClosingStatus = "Aberta" | "Fechada";

export type CompetenceClosure = {
  id: string;
  competence_id: string;
  closed_at: string | null;
  reopened_at: string | null;
  status: ClosingStatus;
  total_income: number;
  total_expense: number;
  balance: number;
  pending_income: number;
  pending_expense: number;
  paid_income: number;
  paid_expense: number;
  created_at: string;
  updated_at: string;
};

export type ClosingSnapshot = {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  pendingIncome: number;
  pendingExpense: number;
  paidIncome: number;
  paidExpense: number;
};