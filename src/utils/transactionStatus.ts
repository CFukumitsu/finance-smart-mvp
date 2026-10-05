export function getTodayIsoDate() {
  return new Date().toISOString().split("T")[0];
}

/** Status automático pela data: futuro é Pendente; senão Recebido (Receita) ou Pago. */
export function getAutomaticTransactionStatus(
  type: string,
  dueDate: string,
  today: string = getTodayIsoDate(),
) {
  if (dueDate > today) {
    return "Pendente";
  }

  if (type === "Receita") {
    return "Recebido";
  }

  return "Pago";
}

/**
 * Status após trocar a data no formulário. Na edição de uma ponta de
 * transferência o status define o sentido no saldo ("Recebido" é crédito;
 * "Pago"/"Pendente" são débito), então ele é preservado. Os demais casos
 * mantêm o cálculo automático.
 */
export function getStatusAfterDateChange(params: {
  type: string;
  currentStatus: string;
  newDueDate: string;
  isEditing: boolean;
  today?: string;
}) {
  if (params.isEditing && params.type === "Transferência") {
    return params.currentStatus;
  }

  return getAutomaticTransactionStatus(
    params.type,
    params.newDueDate,
    params.today,
  );
}
