import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  chooseAction,
  confirmAction,
  dismissToast,
  getFeedbackState,
  notify,
  registerFeedbackHost,
  requestInput,
  resetFeedbackForTests,
  resolveDialog,
  showNotice,
  showToast,
  subscribeFeedback,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./feedbackStore.ts";

beforeEach(() => resetFeedbackForTests());

function currentDialogId() {
  const dialog = getFeedbackState().dialogs[0];
  assert.ok(dialog, "expected an open dialog");
  return dialog.id;
}

test("confirm resolves true only when confirmed", async () => {
  registerFeedbackHost();
  const pending = confirmAction({ message: "Excluir?" });
  resolveDialog(currentDialogId(), true);
  assert.equal(await pending, true);
});

test("cancel resolves false and closes the dialog", async () => {
  registerFeedbackHost();
  const pending = confirmAction({ message: "Excluir?", tone: "danger" });
  resolveDialog(currentDialogId(), null);
  assert.equal(await pending, false);
  assert.equal(getFeedbackState().dialogs.length, 0);
});

test("only the first answer counts (double click / Esc after click)", async () => {
  registerFeedbackHost();
  const pending = confirmAction({ message: "Excluir?" });
  const id = currentDialogId();
  assert.equal(resolveDialog(id, true), true);
  assert.equal(resolveDialog(id, null), false);
  assert.equal(resolveDialog(id, true), false);
  assert.equal(await pending, true);
});

test("dialogs are queued and shown one at a time in order", async () => {
  registerFeedbackHost();
  const first = showNotice({ message: "A" });
  const second = confirmAction({ message: "B" });
  assert.equal(getFeedbackState().dialogs.length, 2);
  assert.equal(getFeedbackState().dialogs[0].options.message, "A");
  resolveDialog(currentDialogId(), true);
  await first;
  assert.equal(getFeedbackState().dialogs[0].options.message, "B");
  resolveDialog(currentDialogId(), true);
  assert.equal(await second, true);
});

test("notice promise waits for the dismissal", async () => {
  registerFeedbackHost();
  let dismissed = false;
  const pending = showNotice({ message: "Salvo" }).then(() => {
    dismissed = true;
  });
  await Promise.resolve();
  assert.equal(dismissed, false);
  resolveDialog(currentDialogId(), true);
  await pending;
  assert.equal(dismissed, true);
});

test("input resolves the typed text or null on cancel", async () => {
  registerFeedbackHost();
  const typed = requestInput({ label: "Nome" });
  resolveDialog(currentDialogId(), "Carteira");
  assert.equal(await typed, "Carteira");

  const cancelled = requestInput({ label: "Nome" });
  resolveDialog(currentDialogId(), null);
  assert.equal(await cancelled, null);
});

test("without a mounted host nothing is executed by accident", async () => {
  assert.equal(await confirmAction({ message: "Excluir?" }), false);
  assert.equal(await requestInput({ label: "Nome" }), null);
  await showNotice({ message: "Aviso" });
  showToast("success", "Ok");
  assert.equal(getFeedbackState().dialogs.length, 0);
  assert.equal(getFeedbackState().toasts.length, 0);
});

test("unmounting the host cancels pending confirmations", async () => {
  const unregister = registerFeedbackHost();
  const pending = confirmAction({ message: "Excluir?" });
  unregister();
  assert.equal(await pending, false);
  assert.equal(getFeedbackState().dialogs.length, 0);
});

test("notify shortcuts queue notices with the right tone", () => {
  registerFeedbackHost();
  notify.error("Erro ao salvar.");
  notify.warning("Informe o nome.");
  notify.info("Modelo salvo.");
  const tones = getFeedbackState().dialogs.map((dialog) =>
    dialog.kind === "notice" ? dialog.options.tone : dialog.kind,
  );
  assert.deepEqual(tones, ["error", "warning", "info"]);
});

test("toasts stack up to three and can be dismissed", () => {
  registerFeedbackHost();
  let notifications = 0;
  subscribeFeedback(() => {
    notifications += 1;
  });
  notify.success("1");
  notify.success("2");
  notify.success("3");
  notify.success("4");
  const toasts = getFeedbackState().toasts;
  assert.deepEqual(
    toasts.map((toast) => toast.title),
    ["2", "3", "4"],
  );
  dismissToast(toasts[0].id);
  assert.equal(getFeedbackState().toasts.length, 2);
  assert.equal(notifications, 5);
});

test("choice resolves the chosen value; cancel resolves null", async () => {
  registerFeedbackHost();
  const choices = [
    { value: "keep-payment", label: "Manter" },
    { value: "delete-payment", label: "Excluir", tone: "danger" as const },
  ];
  const chosen = chooseAction({ message: "Reabrir?", choices });
  resolveDialog(currentDialogId(), "delete-payment");
  assert.equal(await chosen, "delete-payment");

  const cancelled = chooseAction({ message: "Reabrir?", choices });
  resolveDialog(currentDialogId(), null);
  assert.equal(await cancelled, null);
});

test("choice ignores values that are not offered", async () => {
  registerFeedbackHost();
  const pending = chooseAction({
    message: "Reabrir?",
    choices: [{ value: "keep-payment", label: "Manter" }],
  });
  resolveDialog(currentDialogId(), true);
  assert.equal(await pending, null);
});
