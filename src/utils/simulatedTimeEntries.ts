export type TimeEntryRule = {
  id: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
};

export type SimulatedTimeEntry = {
  id: string;
  date: string;
  weekday: number;
  startTime: string;
  endTime: string;
  ruleId: string;
};

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value: string) {
  if (!isoDatePattern.test(value)) {
    throw new Error("Informe datas válidas para realizar a simulação.");
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Informe datas válidas para realizar a simulação.");
  }

  return date;
}

export function simulateTimeEntries({
  startDate,
  endDate,
  rules,
}: {
  startDate: string;
  endDate: string;
  rules: TimeEntryRule[];
}): SimulatedTimeEntry[] {
  const firstDate = parseIsoDate(startDate);
  const lastDate = parseIsoDate(endDate);

  if (firstDate > lastDate) {
    throw new Error("A data inicial não pode ser posterior à data final.");
  }

  const entries: SimulatedTimeEntry[] = [];
  const currentDate = new Date(firstDate);

  while (currentDate <= lastDate) {
    const date = currentDate.toISOString().slice(0, 10);
    const weekday = currentDate.getUTCDay();

    for (const rule of rules) {
      if (rule.weekdays.includes(weekday)) {
        entries.push({
          id: `${rule.id}-${date}`,
          date,
          weekday,
          startTime: rule.startTime,
          endTime: rule.endTime,
          ruleId: rule.id,
        });
      }
    }

    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return entries;
}
