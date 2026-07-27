export type AccountFormType = "Conta" | "Cartão";

export function getAccountCardFields(
  type: AccountFormType,
  closingDay: string,
  dueDay: string,
) {
  if (type === "Conta") {
    return {
      closing_day: null,
      due_day: null,
    };
  }

  return {
    closing_day: closingDay ? Number(closingDay) : null,
    due_day: dueDay ? Number(dueDay) : null,
  };
}
