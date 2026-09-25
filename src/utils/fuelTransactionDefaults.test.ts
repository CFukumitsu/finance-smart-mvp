import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { DEFAULT_NEW_FUEL_TYPE, FUEL_TYPE_OPTIONS, getAutomaticVehicleSelectionPatch, getSuggestedFuelFormPatch } from "./fuelTransactionDefaults.ts";

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

test("descrição sugerida reaproveita veículo e combustível do último abastecimento", () => {
  assert.deepEqual(
    getSuggestedFuelFormPatch({ vehicle_id: "vehicle-a", fuel_type: "Etanol", vehicle_active: true }),
    { vehicle_id: "vehicle-a", fuel_type: "Etanol" }
  );
});

test("descrição sugerida ignora veículo inativo e combustível desconhecido", () => {
  assert.deepEqual(
    getSuggestedFuelFormPatch({ vehicle_id: "vehicle-old", fuel_type: "Querosene", vehicle_active: false }),
    {}
  );
  assert.deepEqual(
    getSuggestedFuelFormPatch({ vehicle_id: null, fuel_type: "GNV", vehicle_active: false }),
    { fuel_type: "GNV" }
  );
});

test("descrição sugerida sem abastecimento anterior não altera os dados", () => {
  assert.deepEqual(getSuggestedFuelFormPatch(null), {});
});

test("descrição sugerida nunca copia posto, odômetro, litros ou preço", () => {
  const patch = getSuggestedFuelFormPatch({ vehicle_id: "vehicle-a", fuel_type: "Etanol", vehicle_active: true });
  assert.deepEqual(Object.keys(patch).sort(), ["fuel_type", "vehicle_id"]);
  assert.ok(FUEL_TYPE_OPTIONS.includes(DEFAULT_NEW_FUEL_TYPE));
});
