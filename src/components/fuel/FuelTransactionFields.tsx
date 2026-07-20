"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, LoaderCircle } from "lucide-react";
import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import {
  ensureGenericFuelStation,
  loadActiveFuelStations,
} from "@/src/services/fuelService";
import { useGeolocation } from "@/src/hooks/useGeolocation";
import { PreciseGeolocationError } from "@/src/utils/preciseGeolocation";
import { logFuelGeolocationDev } from "@/src/utils/fuelGeolocationDiagnostics";
import type { FuelStationOption } from "@/src/types/fuel";
import { parsePtBrNumber } from "@/src/utils/fuelCalculations";
import {
  findNearestRegisteredStation,
  NEARBY_REGISTERED_STATION_RADIUS_METERS,
} from "@/src/utils/fuelStationProximity";
import {
  DEFAULT_NEW_FUEL_TYPE,
  getAutomaticVehicleSelectionPatch,
} from "@/src/utils/fuelTransactionDefaults";

export type FuelForm = {
  vehicle_id: string;
  fuel_station_id: string;
  fuel_type: string;
  odometer: string;
  liters: string;
  price_per_liter: string;
  full_tank: boolean;
  latitude: string;
  longitude: string;
};

type VehicleOption = {
  id: string;
  name: string;
  is_default?: boolean;
  fuel_type?: string;
};

type Props = {
  value: FuelForm;
  onChange: (value: FuelForm) => void;
  onTotalChange: (value: number) => void;
  isEditing?: boolean;
};

export const emptyFuelForm: FuelForm = {
  vehicle_id: "",
  fuel_station_id: "",
  fuel_type: DEFAULT_NEW_FUEL_TYPE,
  odometer: "",
  liters: "",
  price_per_liter: "",
  full_tank: false,
  latitude: "",
  longitude: "",
};

const fuelRecordTypeForVehicle = (fuelType?: string) =>
  ({
    Gasolina: "Gasolina comum",
    Flex: "Gasolina comum",
    Diesel: "Diesel S10",
    Elétrico: "Energia elétrica",
    Híbrido: "Gasolina comum",
  })[fuelType ?? ""] ??
  fuelType ??
  "Gasolina comum";

export default function FuelTransactionFields({
  value,
  onChange,
  onTotalChange,
  isEditing = false,
}: Props) {
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [stations, setStations] = useState<FuelStationOption[]>([]);
  const [message, setMessage] = useState("");
  const [isPreparing, setIsPreparing] = useState(true);
  const { getPosition, isLocating } = useGeolocation();
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const manualStationSelectionRef = useRef(false);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  function applyChange(patch: Partial<FuelForm>) {
    const nextValue = { ...valueRef.current, ...patch };
    valueRef.current = nextValue;
    onChangeRef.current(nextValue);
  }

  async function captureLocationAndSuggest(
    availableStations: FuelStationOption[],
    genericStation: FuelStationOption | null
  ) {
    try {
      applyChange({ latitude: "", longitude: "" });
      setMessage("Obtendo localização precisa...");
      const position = await getPosition({
        onAccuracyChange(accuracyMeters) {
          setMessage(`Precisão aproximada: ${Math.round(accuracyMeters)} metros`);
        },
      });
      const coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      logFuelGeolocationDev("real_coordinates_applied", {
        flow: "fuel-transaction",
        ...coordinates,
        accuracy: position.coords.accuracy,
      });
      logFuelGeolocationDev("registered_stations_search_started", {
        flow: "fuel-transaction",
        availableStationCount: availableStations.length,
      });
      const nearest = findNearestRegisteredStation(
        coordinates,
        availableStations
      );
      logFuelGeolocationDev("registered_stations_search_completed", {
        flow: "fuel-transaction",
        availableStationCount: availableStations.length,
        foundStation: Boolean(nearest),
      });
      const stationId = manualStationSelectionRef.current
        ? valueRef.current.fuel_station_id
        : nearest?.station.id ?? genericStation?.id ?? "";

      applyChange({
        latitude: String(coordinates.latitude),
        longitude: String(coordinates.longitude),
        fuel_station_id: stationId,
      });

      if (manualStationSelectionRef.current) {
        setMessage("Localização atualizada. Sua escolha manual de posto foi preservada.");
      } else if (nearest) {
        setMessage(
          `Posto sugerido automaticamente a ${Math.round(nearest.distanceMeters)} m.`
        );
      } else if (genericStation) {
        setMessage(
          `Nenhum posto cadastrado foi encontrado em até ${NEARBY_REGISTERED_STATION_RADIUS_METERS} m. Selecionamos Outros postos.`
        );
      } else {
        setMessage("Não foi possível determinar um posto automaticamente. Escolha um posto manualmente.");
      }
    } catch (error) {
      if (error instanceof PreciseGeolocationError && error.code === "CANCELLED") {
        return;
      }
      if (!manualStationSelectionRef.current && genericStation) {
        applyChange({ fuel_station_id: genericStation.id });
      }
      setMessage(error instanceof Error ? error.message : "Não foi possível obter uma localização precisa.");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const ownerId = await getCurrentUserId();
        const vehiclesResponse = await supabase
          .from("vehicles")
          .select("id,name,is_default,fuel_type")
          .eq("owner_id", ownerId)
          .eq("active", true)
          .order("is_default", { ascending: false });

        if (vehiclesResponse.error) throw new Error(vehiclesResponse.error.message);

        let genericStation: FuelStationOption | null = null;
        try {
          genericStation = await ensureGenericFuelStation();
        } catch (error) {
          console.error("Erro ao preparar posto genérico:", error);
        }

        const availableStations = await loadActiveFuelStations();
        if (cancelled) return;

        const availableVehicles = (vehiclesResponse.data ?? []).map((item) => ({
          ...item,
          fuel_type: fuelRecordTypeForVehicle(item.fuel_type),
        }));
        setVehicles(availableVehicles);
        setStations(availableStations);

        const firstVehicle = availableVehicles[0];
        const automaticVehiclePatch = getAutomaticVehicleSelectionPatch(
          valueRef.current.vehicle_id,
          firstVehicle?.id
        );
        if (automaticVehiclePatch) applyChange(automaticVehiclePatch);

        if (!isEditing && !valueRef.current.fuel_station_id) {
          await captureLocationAndSuggest(availableStations, genericStation);
        }
      } catch (error) {
        console.error("Erro ao preparar dados do abastecimento:", error);
        if (!cancelled) {
          setMessage("Não foi possível preparar a sugestão de posto. O lançamento ainda pode ser preenchido manualmente.");
        }
      } finally {
        if (!cancelled) setIsPreparing(false);
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  function changeLiters(raw: string) {
    applyChange({ liters: raw });
    const liters = parsePtBrNumber(raw);
    const price = parsePtBrNumber(valueRef.current.price_per_liter);
    if (liters > 0 && price > 0) onTotalChange(liters * price);
  }

  function changePrice(raw: string) {
    applyChange({ price_per_liter: raw });
    const liters = parsePtBrNumber(valueRef.current.liters);
    const price = parsePtBrNumber(raw);
    if (liters > 0 && price > 0) onTotalChange(liters * price);
  }

  async function refreshLocation() {
    logFuelGeolocationDev("location_update_clicked", {
      flow: "fuel-transaction",
      isLocating,
      availableStationCount: stations.length,
    });
    let genericStation = stations.find((station) => station.station_type === "generic") ?? null;
    if (!genericStation) {
      try {
        genericStation = await ensureGenericFuelStation();
        const refreshedStations = await loadActiveFuelStations();
        setStations(refreshedStations);
        await captureLocationAndSuggest(refreshedStations, genericStation);
        return;
      } catch {
        // A captura ainda pode atualizar as coordenadas sem o fallback genérico.
      }
    }
    await captureLocationAndSuggest(stations, genericStation);
  }

  return (
    <fieldset className="space-y-3 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4">
      <legend className="px-2 font-semibold text-amber-300">Dados do abastecimento</legend>
      <div className="grid gap-3 md:grid-cols-2">
        <select
          value={value.vehicle_id}
          onChange={(event) => {
            const vehicle = vehicles.find((item) => item.id === event.target.value);
            applyChange({
              vehicle_id: event.target.value,
              fuel_type: vehicle?.fuel_type ?? value.fuel_type,
            });
          }}
          className="rounded-xl bg-slate-900 p-3 text-white"
        >
          <option value="">Veículo *</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.name}{vehicle.is_default ? " (padrão)" : ""}
            </option>
          ))}
        </select>
        <select
          value={value.fuel_station_id}
          onChange={(event) => {
            manualStationSelectionRef.current = true;
            applyChange({ fuel_station_id: event.target.value });
            setMessage("Posto escolhido manualmente.");
          }}
          className="rounded-xl bg-slate-900 p-3 text-white"
        >
          <option value="">Sem posto</option>
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.name}{station.station_type === "generic" ? " (genérico)" : ""}
            </option>
          ))}
        </select>
        <select
          value={value.fuel_type}
          onChange={(event) => applyChange({ fuel_type: event.target.value })}
          className="rounded-xl bg-slate-900 p-3 text-white"
        >
          {["Gasolina comum", "Gasolina aditivada", "Gasolina premium", "Etanol", "Diesel S10", "Diesel S500", "GNV", "Energia elétrica", "Outro"].map((fuel) => (
            <option key={fuel}>{fuel}</option>
          ))}
        </select>
        <input value={value.odometer} onChange={(event) => applyChange({ odometer: event.target.value })} inputMode="decimal" placeholder="Hodômetro *" className="rounded-xl bg-slate-900 p-3 text-white" />
        <input value={value.liters} onChange={(event) => changeLiters(event.target.value)} inputMode="decimal" placeholder="Litros *" className="rounded-xl bg-slate-900 p-3 text-white" />
        <input value={value.price_per_liter} onChange={(event) => changePrice(event.target.value)} inputMode="decimal" placeholder="Preço por litro *" className="rounded-xl bg-slate-900 p-3 text-white" />
      </div>
      <label className="flex gap-2 text-slate-300">
        <input type="checkbox" checked={value.full_tank} onChange={(event) => applyChange({ full_tank: event.target.checked })} />
        Tanque cheio: {value.full_tank ? "Sim" : "Não"}
      </label>
      <button
        type="button"
        onClick={() => void refreshLocation()}
        disabled={isLocating || isPreparing}
        className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 px-4 py-2 text-amber-200 disabled:opacity-50"
      >
        {isLocating || isPreparing ? <LoaderCircle className="animate-spin" size={16} /> : <LocateFixed size={16} />}
        {isLocating ? "Obtendo localização precisa..." : "Atualizar localização"}
      </button>
      {message && <p role="status" className="text-sm text-amber-100">{message}</p>}
      <p className="text-xs text-slate-400">
        A localização é usada somente neste abastecimento. Se ela falhar, o lançamento não será bloqueado.
      </p>
    </fieldset>
  );
}
