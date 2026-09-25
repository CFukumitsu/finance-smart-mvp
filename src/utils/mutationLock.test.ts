import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner needs the extension.
import { createMutationLock } from "./mutationLock.ts";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("rapid repeated submits and conflicting actions execute only once", async () => {
  const states: (string | null)[] = [];
  const lock = createMutationLock((key) => states.push(key));
  const network = deferred();
  let writes = 0;
  const save = () => lock.run("save", async () => { writes++; await network.promise; });
  const first = save();
  assert.equal(lock.isLocked(), true);
  assert.deepEqual(states, ["save"]);
  await Promise.all([save(), save(), lock.run("delete", async () => { writes++; })]);
  assert.equal(writes, 1);
  assert.equal(lock.isLocked(), true);
  network.resolve();
  await first;
  assert.deepEqual(states, ["save", null]);
  assert.equal(lock.isLocked(), false);
  await save();
  assert.equal(writes, 2);
});

test("failure releases the lock and preserves the error for the caller", async () => {
  const states: (string | null)[] = [];
  const lock = createMutationLock((key) => states.push(key));
  const failure = new Error("network failed");
  await assert.rejects(lock.run("save", async () => { throw failure; }), failure);
  assert.equal(lock.isLocked(), false);
  assert.equal(await lock.run("retry", async () => 42), 42);
  assert.deepEqual(states, ["save", null, "retry", null]);
});

test("validation returns release the lock and independent surfaces remain usable", async () => {
  const left = createMutationLock(() => {});
  const right = createMutationLock(() => {});
  const network = deferred();
  await left.run("invalid", async () => undefined);
  const first = left.run("save", () => network.promise);
  assert.equal(await right.run("save", async () => "independent"), "independent");
  network.resolve();
  await first;
});
