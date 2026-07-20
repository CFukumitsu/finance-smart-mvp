import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { DEFAULT_NEW_FUEL_TYPE, getAutomaticVehicleSelectionPatch } from "./fuelTransactionDefaults.ts";

test("novo abastecimento inicia com Etanol", () => {
  assert.equal(DEFAULT_NEW_FUEL_TYPE, "Etanol");
});

test("seleção automática do veículo não sobrescreve o combustível inicial", () => {
  assert.deepEqual(getAutomaticVehicleSelectionPatch("", "vehicle-a"), {
    vehicle_id: "vehicle-a",
  });
});

test("edição preserva o veículo e o combustível existentes", () => {
  assert.equal(getAutomaticVehicleSelectionPatch("vehicle-saved", "vehicle-a"), null);
});
