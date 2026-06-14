export type RecurrenceType = "income" | "expense";
export type RecurrenceFrequency = "monthly";
export type RecurrenceStatus = "active" | "cancelled";

export type RecurringTransaction = {
  id: string;
  description: string;
  type: RecurrenceType;
  amount: number;
  account_id: string | null;
  category_id: string | null;
  frequency: RecurrenceFrequency;
  start_competence_id: string;
  end_competence_id: string | null;
  status: RecurrenceStatus;
  created_at: string;
  updated_at: string | null;
};

export type RecurringTransactionFormData = {
  description: string;
  type: RecurrenceType;
  amount: string;
  accountId: string;
  categoryId: string;
  startCompetenceId: string;
  endCompetenceId: string;
};