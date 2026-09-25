import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { isMissingFuelStationTypeColumn, isMissingGenericFuelStationFunction, withCompatibleFuelStationType } from "./fuelStationCompatibility.ts";

test("reconhece somente a ausência da coluna station_type", () => {
  assert.equal(
    isMissingFuelStationTypeColumn({
      code: "42703",
      message: "column fuel_stations.station_type does not exist",
    }),
    true
  );
  assert.equal(
    isMissingFuelStationTypeColumn({ code: "42501", message: "permission denied" }),
    false
  );
});

test("normaliza postos legados sem depender do nome", () => {
  assert.equal(withCompatibleFuelStationType({ id: "1", name: "Posto A" }).station_type, "registered");
  assert.equal(
    withCompatibleFuelStationType({ id: "2", name: "Qualquer nome", station_type: "generic" })
      .station_type,
    "generic"
  );
});

test("reconhece somente a ausência da RPC do posto genérico", () => {
  assert.equal(
    isMissingGenericFuelStationFunction({
      code: "PGRST202",
      message:
        "Could not find the function public.ensure_generic_fuel_station without parameters in the schema cache",
    }),
    true
  );
  assert.equal(
    isMissingGenericFuelStationFunction({
      code: "42883",
      message: "function public.ensure_generic_fuel_station() does not exist",
    }),
    true
  );
  assert.equal(
    isMissingGenericFuelStationFunction({ code: "PGRST202", message: "Could not find the function public.other_function" }),
    false
  );
  assert.equal(
    isMissingGenericFuelStationFunction({ code: "P0001", message: "Usuário não autenticado" }),
    false
  );
  assert.equal(isMissingGenericFuelStationFunction(null), false);
});
