"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, LoaderCircle } from "lucide-react";
import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import {
  ensureGenericFuelStation,
  loadActiveFuelStations,
  registerFuelStationFromGoogle,
  searchNearbyFuelStations,
} from "@/src/services/fuelService";
import { useGeolocation } from "@/src/hooks/useGeolocation";
import {
  PreciseGeolocationError,
  type PreciseGeolocationOptions,
} from "@/src/utils/preciseGeolocation";
import { logFuelGeolocationDev } from "@/src/utils/fuelGeolocationDiagnostics";
import type { FuelStationOption, NearbyFuelStation } from "@/src/types/fuel";
import { parsePtBrNumber } from "@/src/utils/fuelCalculations";
import {
  decideGoogleStationSearch,
  markRegisteredGooglePlaces,
  suggestNearestFuelStation,
  type Coordinates,
  type FuelStationSuggestion,
} from "@/src/utils/fuelStationProximity";
import {
  DEFAULT_NEW_FUEL_TYPE,
  FUEL_TYPE_OPTIONS,
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
  full_tank: true,
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

// Evita aceitar a primeira leitura grosseira ou uma posição em cache anterior
// à chegada no posto. Leituras de até 100 m continuam sendo aceitas na hora.
// No celular o GPS pode levar bem mais que o padrão de 8 s para o primeiro fix
// (sob a cobertura do posto); ao expirar, o fallback por rede costuma falhar com
// POSITION_UNAVAILABLE. O notebook não passa por isso porque localiza via Wi-Fi.
const FUEL_TRANSACTION_LOCATION_OPTIONS = {
  highAccuracyTimeoutMs: 30_000,
  maximumAgeMs: 10_000,
  minimumSampleCount: 2,
  minimumWaitMs: 3_000,
} satisfies PreciseGeolocationOptions;

type GoogleStationSuggestion = NearbyFuelStation & {
  registeredStationId: string | null;
};

// Etapas visíveis na tela para distinguir, também no celular em produção:
// GPS falhou / nenhum cadastrado / Google não executado / falhou / encontrou.
type LocationTrace = {
  gps: string;
  registered: string;
  google: string;
};

// Usados apenas em handlers/efeitos, fora da renderização.
function currentTimestamp() {
  return Date.now();
}

function formatElapsedSeconds(startedAt: number) {
  return ((currentTimestamp() - startedAt) / 1_000).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  });
}

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null) return null;
  return distanceMeters < 1_000
    ? `${Math.round(distanceMeters)} m`
    : `${(distanceMeters / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

function describeRegisteredSearch(
  suggestion: FuelStationSuggestion<FuelStationOption>
) {
  switch (suggestion.status) {
    case "matched":
      return `${suggestion.station.name} a ${Math.round(suggestion.distanceMeters)} m`;
    case "none-nearby":
      return `nenhum a até ${suggestion.radiusMeters} m`;
    case "no-stations-with-location":
      return "nenhum posto cadastrado tem localização";
    case "inaccurate":
      return `não avaliado: precisão de ±${suggestion.accuracyMeters} m`;
    case "invalid-origin":
      return "não avaliado: coordenadas inválidas";
  }
}

const GOOGLE_SKIP_REASONS = {
  matched: "não executada: posto cadastrado encontrado",
  "manual-selection": "não executada: posto escolhido manualmente",
  "invalid-origin": "não executada: coordenadas inválidas",
} as const;

function describeStationSuggestion(
  suggestion: FuelStationSuggestion<FuelStationOption>,
  hasGenericStation: boolean
) {
  const fallback = hasGenericStation
    ? "Selecionamos Outros postos."
    : "Escolha um posto manualmente.";

  switch (suggestion.status) {
    case "matched":
      return `Posto sugerido automaticamente: ${suggestion.station.name} (a ${Math.round(suggestion.distanceMeters)} m).`;
    case "none-nearby":
      return `Nenhum posto cadastrado a até ${suggestion.radiusMeters} m. ${fallback}`;
    case "no-stations-with-location":
      return `Nenhum posto cadastrado possui localização. ${fallback}`;
    case "inaccurate":
      return `Localização imprecisa (±${suggestion.accuracyMeters} m) para identificar o posto. Toque em Atualizar localização ou escolha manualmente.`;
    case "invalid-origin":
      return `O dispositivo retornou coordenadas inválidas. ${fallback}`;
  }
}

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
  const [trace, setTrace] = useState<LocationTrace | null>(null);
  const [googleStations, setGoogleStations] = useState<GoogleStationSuggestion[]>([]);
  const [isSearchingGoogle, setIsSearchingGoogle] = useState(false);
  const [usingPlaceId, setUsingPlaceId] = useState<string | null>(null);
  const { getPosition, isLocating } = useGeolocation();
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const manualStationSelectionRef = useRef(false);
  // Cada tentativa de localização invalida resultados atrasados da anterior.
  const locationRunRef = useRef(0);
  const locationStartedAtRef = useRef(0);

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

  function elapsedSeconds() {
    return formatElapsedSeconds(locationStartedAtRef.current);
  }

  function updateTrace(patch: Partial<LocationTrace>) {
    setTrace((current) => ({
      gps: "—",
      registered: "—",
      google: "—",
      ...current,
      ...patch,
    }));
  }

  function startLocationRequest() {
    locationRunRef.current += 1;
    locationStartedAtRef.current = currentTimestamp();
    applyChange({ latitude: "", longitude: "" });
    setGoogleStations([]);
    setTrace({ gps: "obtendo...", registered: "aguardando GPS", google: "aguardando GPS" });
    setMessage("Obtendo localização precisa...");
    return getPosition({
      ...FUEL_TRANSACTION_LOCATION_OPTIONS,
      onAccuracyChange(accuracyMeters) {
        setMessage(`Precisão aproximada: ${Math.round(accuracyMeters)} metros`);
      },
    });
  }

  async function suggestStationFromLocation(
    positionRequest: Promise<GeolocationPosition>,
    availableStations: FuelStationOption[],
    genericStation: FuelStationOption | null
  ) {
    const runId = locationRunRef.current;
    try {
      const position = await positionRequest;
      if (runId !== locationRunRef.current) return;
      const coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const accuracyMeters = position.coords.accuracy;
      logFuelGeolocationDev("real_coordinates_applied", {
        flow: "fuel-transaction",
        ...coordinates,
        accuracy: accuracyMeters,
      });
      updateTrace({
        gps: `obtido (±${Math.round(accuracyMeters)} m em ${elapsedSeconds()} s)`,
      });

      const suggestion = suggestNearestFuelStation(
        coordinates,
        accuracyMeters,
        availableStations
      );
      logFuelGeolocationDev("registered_stations_search_completed", {
        flow: "fuel-transaction",
        availableStationCount: availableStations.length,
        status: suggestion.status,
        radiusMeters: "radiusMeters" in suggestion ? suggestion.radiusMeters : null,
        distanceMeters:
          suggestion.status === "matched" ? suggestion.distanceMeters : null,
      });
      updateTrace({ registered: describeRegisteredSearch(suggestion) });

      const googleDecision = decideGoogleStationSearch(
        suggestion.status,
        accuracyMeters,
        manualStationSelectionRef.current
      );
      if (googleDecision.search) {
        void searchGoogleStations(
          coordinates,
          googleDecision.radiusMeters,
          availableStations,
          runId
        );
      } else {
        logFuelGeolocationDev("google_stations_search_skipped", {
          flow: "fuel-transaction",
          reason: googleDecision.reason,
        });
        updateTrace({ google: GOOGLE_SKIP_REASONS[googleDecision.reason] });
      }
      const stationId = manualStationSelectionRef.current
        ? valueRef.current.fuel_station_id
        : suggestion.status === "matched"
          ? suggestion.station.id
          : genericStation?.id ?? "";

      applyChange({
        latitude: String(coordinates.latitude),
        longitude: String(coordinates.longitude),
        fuel_station_id: stationId,
      });

      setMessage(
        manualStationSelectionRef.current
          ? "Localização atualizada. Sua escolha manual de posto foi preservada."
          : describeStationSuggestion(suggestion, genericStation !== null)
      );
    } catch (error) {
      if (error instanceof PreciseGeolocationError && error.code === "CANCELLED") {
        return;
      }
      if (runId !== locationRunRef.current) return;
      const code = error instanceof PreciseGeolocationError ? error.code : "UNKNOWN";
      logFuelGeolocationDev("gps_failed", { flow: "fuel-transaction", code });
      updateTrace({
        gps: `falhou (${code} após ${elapsedSeconds()} s)`,
        registered: "não avaliado: sem localização",
        google: "não executada: sem localização",
      });
      if (!manualStationSelectionRef.current && genericStation) {
        applyChange({ fuel_station_id: genericStation.id });
      }
      setMessage(
        `${error instanceof Error ? error.message : "Não foi possível obter uma localização precisa."} Você pode escolher o posto manualmente.`
      );
    }
  }

  async function searchGoogleStations(
    coordinates: Coordinates,
    radiusMeters: number,
    availableStations: FuelStationOption[],
    runId: number
  ) {
    setIsSearchingGoogle(true);
    updateTrace({ google: `buscando num raio de ${radiusMeters} m...` });
    logFuelGeolocationDev("google_stations_search_started", {
      flow: "fuel-transaction",
      radiusMeters,
    });

    try {
      const places = await searchNearbyFuelStations(
        coordinates.latitude,
        coordinates.longitude,
        radiusMeters
      );
      if (runId !== locationRunRef.current) return;

      const suggestions = markRegisteredGooglePlaces(places, availableStations);
      logFuelGeolocationDev("google_stations_search_completed", {
        flow: "fuel-transaction",
        count: places.length,
      });
      setGoogleStations(suggestions);
      updateTrace({
        google:
          places.length === 0
            ? `nenhum posto num raio de ${radiusMeters} m`
            : `${places.length} posto${places.length === 1 ? "" : "s"} encontrado${places.length === 1 ? "" : "s"}`,
      });
    } catch (error) {
      if (runId !== locationRunRef.current) return;
      const reason = error instanceof Error ? error.message : "erro desconhecido";
      console.warn("Busca de postos no Google falhou:", error);
      updateTrace({ google: `falhou: ${reason}` });
    } finally {
      if (runId === locationRunRef.current) setIsSearchingGoogle(false);
    }
  }

  async function selectGoogleStation(place: GoogleStationSuggestion) {
    setUsingPlaceId(place.googlePlaceId);
    try {
      let stationId = place.registeredStationId;
      let stationName = place.name;
      let created = false;

      if (!stationId) {
        const registered = await registerFuelStationFromGoogle(place.googlePlaceId);
        stationId = registered.id;
        stationName = registered.name;
        created = registered.created;
        setStations(await loadActiveFuelStations());
      }

      // Escolha explícita do usuário: não será substituída por novas leituras.
      manualStationSelectionRef.current = true;
      applyChange({ fuel_station_id: stationId });
      setGoogleStations([]);
      setMessage(
        created
          ? `Posto ${stationName} cadastrado e selecionado.`
          : `Posto ${stationName} selecionado.`
      );
    } catch (error) {
      setMessage(
        `Não foi possível usar o posto do Google: ${error instanceof Error ? error.message : "erro desconhecido"}. Escolha o posto manualmente.`
      );
    } finally {
      setUsingPlaceId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      // A localização começa junto com o carregamento dos dados para que o
      // GPS já esteja estabilizando enquanto os postos são consultados.
      const positionRequest =
        !isEditing && !valueRef.current.fuel_station_id
          ? startLocationRequest()
          : null;
      // Evita rejeição não tratada se o carregamento falhar antes do await.
      positionRequest?.catch(() => undefined);

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
          // Recurso opcional: a falha não pode bloquear o lançamento.
          console.warn("Posto genérico indisponível:", error);
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

        if (positionRequest) {
          await suggestStationFromLocation(
            positionRequest,
            availableStations,
            genericStation
          );
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
    let availableStations = stations;
    if (!genericStation) {
      try {
        genericStation = await ensureGenericFuelStation();
        if (genericStation) {
          availableStations = await loadActiveFuelStations();
          setStations(availableStations);
        }
      } catch (error) {
        // A captura ainda pode atualizar as coordenadas sem o fallback genérico.
        console.warn("Posto genérico indisponível:", error);
      }
    }
    await suggestStationFromLocation(
      startLocationRequest(),
      availableStations,
      genericStation
    );
  }

  return (
    // min-w-0: por padrão o navegador dá ao fieldset min-inline-size: min-content,
    // o que o fazia crescer até a maior opção dos selects (ex.: nome longo de posto).
    <fieldset className="min-w-0 space-y-3 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4">
      <legend className="px-2 font-semibold text-amber-300">Dados do abastecimento</legend>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <select
          value={value.vehicle_id}
          onChange={(event) => {
            const vehicle = vehicles.find((item) => item.id === event.target.value);
            applyChange({
              vehicle_id: event.target.value,
              fuel_type: vehicle?.fuel_type ?? value.fuel_type,
            });
          }}
          className="w-full min-w-0 rounded-xl bg-slate-900 p-3 text-white"
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
          className="w-full min-w-0 rounded-xl bg-slate-900 p-3 text-white"
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
          className="w-full min-w-0 rounded-xl bg-slate-900 p-3 text-white"
        >
          {FUEL_TYPE_OPTIONS.map((fuel) => (
            <option key={fuel}>{fuel}</option>
          ))}
        </select>
        <input value={value.odometer} onChange={(event) => applyChange({ odometer: event.target.value })} inputMode="decimal" placeholder="Hodômetro *" className="w-full min-w-0 rounded-xl bg-slate-900 p-3 text-white" />
        <input value={value.liters} onChange={(event) => changeLiters(event.target.value)} inputMode="decimal" placeholder="Litros *" className="w-full min-w-0 rounded-xl bg-slate-900 p-3 text-white" />
        <input value={value.price_per_liter} onChange={(event) => changePrice(event.target.value)} inputMode="decimal" placeholder="Preço por litro *" className="w-full min-w-0 rounded-xl bg-slate-900 p-3 text-white" />
      </div>
      <label className="flex gap-2 text-slate-300">
        <input type="checkbox" checked={value.full_tank} onChange={(event) => applyChange({ full_tank: event.target.checked })} />
        Tanque cheio: {value.full_tank ? "Sim" : "Não"}
      </label>
      <button
        type="button"
        onClick={() => void refreshLocation()}
        disabled={isLocating || isPreparing}
        className="inline-flex max-w-full items-center gap-2 rounded-xl border border-amber-400/30 px-4 py-2 text-left text-amber-200 disabled:opacity-50"
      >
        {isLocating || isPreparing ? <LoaderCircle className="shrink-0 animate-spin" size={16} /> : <LocateFixed className="shrink-0" size={16} />}
        {isLocating ? "Obtendo localização precisa..." : "Atualizar localização"}
      </button>
      {message && <p role="status" className="break-words text-sm text-amber-100">{message}</p>}
      {googleStations.length > 0 && (
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-amber-200">
            Postos encontrados pelo Google perto de você
          </p>
          <ul className="min-w-0 space-y-2">
            {googleStations.map((place, index) => (
              <li
                key={place.googlePlaceId}
                className="flex min-w-0 flex-col gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="break-words font-semibold text-white">
                    {place.name}
                    {index === 0 && (
                      <span className="ml-2 text-xs font-medium text-amber-300">mais próximo</span>
                    )}
                  </p>
                  {place.formattedAddress && (
                    <p className="break-words text-xs text-slate-400">{place.formattedAddress}</p>
                  )}
                  <p className="text-xs text-slate-400">
                    {[formatDistance(place.distanceMeters), place.registeredStationId ? "já cadastrado" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void selectGoogleStation(place)}
                  disabled={usingPlaceId !== null}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-400/30 px-3 py-2 text-sm font-semibold text-amber-200 disabled:opacity-50"
                >
                  {usingPlaceId === place.googlePlaceId && <LoaderCircle className="animate-spin" size={14} />}
                  {place.registeredStationId ? "Usar este posto" : "Cadastrar e usar"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {isSearchingGoogle && googleStations.length === 0 && (
        <p className="text-sm text-amber-100">Buscando postos próximos no Google...</p>
      )}
      {trace && (
        <dl className="grid min-w-0 gap-0.5 rounded-lg bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
          <div className="min-w-0 break-words"><dt className="inline">GPS: </dt><dd className="inline">{trace.gps}</dd></div>
          <div className="min-w-0 break-words"><dt className="inline">Postos cadastrados: </dt><dd className="inline">{trace.registered}</dd></div>
          <div className="min-w-0 break-words"><dt className="inline">Busca no Google: </dt><dd className="inline">{trace.google}</dd></div>
        </dl>
      )}
      <p className="text-xs text-slate-400">
        A localização é usada somente neste abastecimento. Se ela falhar, o lançamento não será bloqueado.
      </p>
    </fieldset>
  );
}
