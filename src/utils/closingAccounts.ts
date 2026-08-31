export type ClosingAccountClassification = {
  id: string;
  type: "Conta" | "Cartão";
  show_on_investments_dashboard?: boolean | null;
  investment_account_kind?: "BALANCE" | null;
};

export function isInvestmentAccount(
  account: ClosingAccountClassification,
) {
  return (
    account.type === "Conta" &&
    (account.show_on_investments_dashboard === true ||
      account.investment_account_kind === "BALANCE")
  );
}

export function requiresTraditionalAccountClosure(
  account: ClosingAccountClassification,
) {
  return account.type === "Conta" && !isInvestmentAccount(account);
}

export function areRequiredClosuresComplete(params: {
  accounts: readonly ClosingAccountClassification[];
  closedAccountIds: ReadonlySet<string>;
  closedCardIds: ReadonlySet<string>;
}) {
  return params.accounts.every((account) => {
    if (account.type === "Cartão") {
      return params.closedCardIds.has(account.id);
    }

    if (requiresTraditionalAccountClosure(account)) {
      return params.closedAccountIds.has(account.id);
    }

    return true;
  });
}
