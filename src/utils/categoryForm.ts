export type CategoryFormType = "Receita" | "Despesa" | "Transferência";

type CategoryMonthlyPayload = {
  monthly_limit: number | null;
  monthly_goal: number | null;
};

export function getCategoryMonthlyFormValues(
  type: CategoryFormType,
  monthlyLimit: string,
  monthlyGoal: string,
) {
  if (type === "Despesa") {
    return {
      monthly_limit: monthlyLimit,
      monthly_goal: "",
    };
  }

  if (type === "Receita") {
    return {
      monthly_limit: "",
      monthly_goal: monthlyGoal,
    };
  }

  return {
    monthly_limit: monthlyLimit,
    monthly_goal: monthlyGoal,
  };
}

export function getCategoryMonthlyPayload(
  type: CategoryFormType,
  monthlyLimit: string,
  monthlyGoal: string,
): CategoryMonthlyPayload {
  if (type === "Despesa") {
    return {
      monthly_limit: monthlyLimit ? Number(monthlyLimit) : 0,
      monthly_goal: null,
    };
  }

  if (type === "Receita") {
    return {
      monthly_limit: null,
      monthly_goal: monthlyGoal ? Number(monthlyGoal) : 0,
    };
  }

  return {
    monthly_limit: monthlyLimit ? Number(monthlyLimit) : 0,
    monthly_goal: monthlyGoal ? Number(monthlyGoal) : 0,
  };
}
