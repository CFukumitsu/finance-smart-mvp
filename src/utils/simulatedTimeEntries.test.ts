import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { simulateTimeEntries } from "./simulatedTimeEntries.ts";

test("combina múltiplas regras no mesmo período sem sobrescrever horários", () => {
  const entries = simulateTimeEntries({
    startDate: "2026-08-01",
    endDate: "2026-08-30",
    rules: [
      {
        id: "regular",
        weekdays: [1, 2, 3, 4],
        startTime: "08:00",
        endTime: "17:00",
      },
      {
        id: "short",
        weekdays: [5, 6],
        startTime: "08:00",
        endTime: "12:00",
      },
    ],
  });

  assert.equal(entries.length, 25);
  assert.deepEqual(entries[0], {
    id: "short-2026-08-01",
    date: "2026-08-01",
    weekday: 6,
    startTime: "08:00",
    endTime: "12:00",
    ruleId: "short",
  });
  assert.equal(entries.some((entry) => entry.weekday === 0), false);
  assert.equal(entries.some((entry) => entry.date === "2026-08-03" && entry.endTime === "17:00"), true);
  assert.equal(entries.some((entry) => entry.date === "2026-08-07" && entry.endTime === "12:00"), true);
});

test("gera um lançamento para cada regra válida no mesmo dia", () => {
  const entries = simulateTimeEntries({
    startDate: "2026-08-03",
    endDate: "2026-08-03",
    rules: [
      { id: "morning", weekdays: [1], startTime: "08:00", endTime: "12:00" },
      { id: "afternoon", weekdays: [1], startTime: "13:00", endTime: "17:00" },
    ],
  });

  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((entry) => entry.ruleId), ["morning", "afternoon"]);
});

test("considera as duas extremidades do período", () => {
  const entries = simulateTimeEntries({
    startDate: "2026-08-07",
    endDate: "2026-08-08",
    rules: [
      { id: "edge", weekdays: [5, 6], startTime: "08:00", endTime: "12:00" },
    ],
  });

  assert.deepEqual(entries.map((entry) => entry.date), ["2026-08-07", "2026-08-08"]);
});

test("rejeita período invertido", () => {
  assert.throws(
    () => simulateTimeEntries({ startDate: "2026-08-30", endDate: "2026-08-01", rules: [] }),
    /data inicial não pode ser posterior/i,
  );
});
