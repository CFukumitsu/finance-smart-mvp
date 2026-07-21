"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Pencil,
  Plus,
  Power,
  PowerOff,
  X,
} from "lucide-react";
import AppShell from "../../../components/layout/AppShell";
import { useGeolocation } from "@/src/hooks/useGeolocation";
import { PreciseGeolocationError } from "@/src/utils/preciseGeolocation";
import { logFuelGeolocationDev } from "@/src/utils/fuelGeolocationDiagnostics";
import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import {
  INITIAL_NEARBY_FUEL_STATION_RADIUS_METERS,
  loadGoogleFuelStationDetails,
  searchNearbyFuelStations,
} from "@/src/services/fuelService";
import type { NearbyFuelStation } from "@/src/types/fuel";
import NearbyFuelStationsMap from "@/src/components/fuel/NearbyFuelStationsMap";
import {
  isMissingFuelStationTypeColumn,
  withCompatibleFuelStationType,
} from "@/src/utils/fuelStationCompatibility";
import {
  calculateNearbyFuelStationSearchRadius,
  MAXIMUM_NEARBY_LOCATION_ACCURACY_METERS,
} from "@/src/utils/fuelStationProximity";

type FuelStation = {
  id: string;
  name: string;
  brand: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
  google_maps_uri: string | null;
  google_rating: number | null;
  google_user_rating_count: number | null;
  google_business_status: string | null;
  google_primary_type: string | null;
  google_display_name: string | null;
  google_formatted_address: string | null;
  google_last_synced_at: string | null;
  active: boolean;
  station_type: "registered" | "generic";
  created_at: string;
};

type StatusFilter = "active" | "inactive" | "all";

const emptyForm = {
  name: "",
  brand: "",
  address: "",
  neighborhood: "",
  city: "",
  state: "",
  postal_code: "",
  latitude: "",
  longitude: "",
  google_place_id: "",
  google_maps_uri: "",
  google_rating: null as number | null,
  google_user_rating_count: null as number | null,
  google_business_status: "",
  google_primary_type: "",
  google_display_name: "",
  google_formatted_address: "",
  google_last_synced_at: "",
  active: true,
};

export default function FuelStationsPage() {
  const [stations, setStations] = useState<FuelStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearchingNearby, setIsSearchingNearby] = useState(false);
  const [selectingPlaceId, setSelectingPlaceId] = useState<string | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyFuelStation[]>([]);
  const [nearbyOrigin, setNearbyOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [highlightedPlaceId, setHighlightedPlaceId] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const { getPosition, cancelPosition, isLocating } = useGeolocation();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingStationId, setEditingStationId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("active");

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadStations();
  }, []);

  async function loadStations() {
    try {
      setIsLoading(true);

      const ownerId = await getCurrentUserId();

      let { data, error } = await supabase
        .from("fuel_stations")
        .select(`
          id,
          name,
          brand,
          address,
          neighborhood,
          city,
          state,
          postal_code,
          latitude,
          longitude,
          google_place_id,
          google_maps_uri,
          google_rating,
          google_user_rating_count,
          google_business_status,
          google_primary_type,
          google_display_name,
          google_formatted_address,
          google_last_synced_at,
          active,
          station_type,
          created_at
        `)
        .eq("owner_id", ownerId)
        .order("name", { ascending: true });

      if (isMissingFuelStationTypeColumn(error)) {
        const legacyResponse = await supabase
          .from("fuel_stations")
          .select(`
            id,
            name,
            brand,
            address,
            neighborhood,
            city,
            state,
            postal_code,
            latitude,
            longitude,
            google_place_id,
            google_maps_uri,
            google_rating,
            google_user_rating_count,
            google_business_status,
            google_primary_type,
            google_display_name,
            google_formatted_address,
            google_last_synced_at,
            active,
            created_at
          `)
          .eq("owner_id", ownerId)
          .order("name", { ascending: true });

        data = legacyResponse.data as typeof data;
        error = legacyResponse.error;
      }

      if (error) {
        throw error;
      }

      setStations(
        (data ?? []).map(withCompatibleFuelStationType) as FuelStation[]
      );
    } catch (error) {
      console.error("Erro ao carregar postos:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Erro ao carregar postos."
      );
    } finally {
      setIsLoading(false);
    }
  }

  const filteredStations = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return stations.filter((station) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && station.active) ||
        (statusFilter === "inactive" && !station.active);

      if (!matchesStatus) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableContent = [
        station.name,
        station.brand,
        station.address,
        station.neighborhood,
        station.city,
        station.state,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableContent.includes(normalizedSearch);
    });
  }, [stations, searchTerm, statusFilter]);

  const registeredPlaceIds = useMemo(
    () =>
      new Set(
        stations.flatMap((station) =>
          station.google_place_id ? [station.google_place_id] : []
        )
      ),
    [stations]
  );

  const editingGenericStation = useMemo(
    () =>
      stations.find((station) => station.id === editingStationId)?.station_type ===
      "generic",
    [editingStationId, stations]
  );

  function resetForm() {
    setEditingStationId(null);
    setForm(emptyForm);
    setNearbyPlaces([]);
    setNearbyOrigin(null);
    setHighlightedPlaceId(null);
    setLocationMessage("");
    setSelectingPlaceId(null);
  }

  function openNewStationDrawer() {
    resetForm();
    setIsDrawerOpen(true);
  }

  function openEditStationDrawer(station: FuelStation) {
    setEditingStationId(station.id);

    setForm({
      name: station.name ?? "",
      brand: station.brand ?? "",
      address: station.address ?? "",
      neighborhood: station.neighborhood ?? "",
      city: station.city ?? "",
      state: station.state ?? "",
      postal_code: station.postal_code ?? "",
      latitude:
        station.latitude !== null
          ? String(station.latitude)
          : "",
      longitude:
        station.longitude !== null
          ? String(station.longitude)
          : "",
      google_place_id: station.google_place_id ?? "",
      google_maps_uri: station.google_maps_uri ?? "",
      google_rating: station.google_rating,
      google_user_rating_count: station.google_user_rating_count,
      google_business_status: station.google_business_status ?? "",
      google_primary_type: station.google_primary_type ?? "",
      google_display_name: station.google_display_name ?? "",
      google_formatted_address: station.google_formatted_address ?? "",
      google_last_synced_at: station.google_last_synced_at ?? "",
      active: station.active,
    });

    setIsDrawerOpen(true);
  }

  function closeDrawer() {
    cancelPosition();
    resetForm();
    setIsDrawerOpen(false);
  }

  function formatPostalCode(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 8);

    if (digits.length <= 5) {
      return digits;
    }

    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }

  function formatState(value: string) {
    return value
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 2);
  }

  function parseCoordinate(value: string) {
    if (!value.trim()) {
      return null;
    }

    const parsed = Number(value.replace(",", "."));

    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatDistance(distanceMeters: number | null) {
    if (distanceMeters === null) {
      return null;
    }

    if (distanceMeters < 1000) {
      return `${distanceMeters} m`;
    }

    return `${(distanceMeters / 1000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })} km`;
  }

  async function searchNearbyStations() {
    logFuelGeolocationDev("location_update_clicked", {
      flow: "fuel-station-registration",
      isLocating,
      isSearchingNearby,
      editingGenericStation,
    });
    if (editingGenericStation) {
      setLocationMessage("Outros postos não representa um local fixo e não pode receber dados do Google.");
      return;
    }

    try {
      setLocationMessage("Obtendo localização precisa...");
      setNearbyPlaces([]);
      setNearbyOrigin(null);
      setHighlightedPlaceId(null);
      const position = await getPosition({
        maximumAccuracyMeters: MAXIMUM_NEARBY_LOCATION_ACCURACY_METERS,
        waitForPreferredAccuracy: true,
        onAccuracyChange(accuracyMeters) {
          setLocationMessage(`Precisão aproximada: ${Math.round(accuracyMeters)} metros`);
        },
      });
      const { latitude, longitude } = position.coords;
      logFuelGeolocationDev("real_coordinates_applied", {
        flow: "fuel-station-registration",
        latitude,
        longitude,
        accuracy: position.coords.accuracy,
      });
      setNearbyOrigin({ latitude, longitude });

      setLocationMessage("Buscando postos de combustível próximos...");
      setIsSearchingNearby(true);
      const searchRadius = calculateNearbyFuelStationSearchRadius(
        position.coords.accuracy,
        INITIAL_NEARBY_FUEL_STATION_RADIUS_METERS
      );
      const places = await searchNearbyFuelStations(
        latitude,
        longitude,
        searchRadius ?? INITIAL_NEARBY_FUEL_STATION_RADIUS_METERS
      );
      setNearbyPlaces(places);
      setHighlightedPlaceId(places[0]?.googlePlaceId ?? null);
      setLocationMessage(
        places.length === 0
          ? "Nenhum posto de combustível foi encontrado próximo à sua localização."
          : `${places.length} posto${places.length === 1 ? "" : "s"} encontrado${places.length === 1 ? "" : "s"}. Selecione um para preencher o formulário.`
      );
    } catch (error) {
      if (error instanceof PreciseGeolocationError && error.code === "CANCELLED") {
        return;
      }
      console.error("Erro ao localizar postos próximos:", error);
      setLocationMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível localizar postos próximos."
      );
    } finally {
      setIsSearchingNearby(false);
    }
  }

  function loadExistingStation(station: FuelStation) {
    openEditStationDrawer(station);
    setLocationMessage(
      "Este posto já estava cadastrado. O cadastro existente foi carregado para edição."
    );
  }

  async function selectNearbyStation(place: NearbyFuelStation) {
    const existingStation = stations.find(
      (station) => station.google_place_id === place.googlePlaceId
    );

    if (existingStation) {
      setLocationMessage("Este posto já está cadastrado na sua conta.");

      if (window.confirm("Este posto já está cadastrado. Deseja carregar o cadastro existente para edição?")) {
        loadExistingStation(existingStation);
      }
      return;
    }

    try {
      setSelectingPlaceId(place.googlePlaceId);
      setLocationMessage("Carregando os dados do posto selecionado...");
      const details = await loadGoogleFuelStationDetails(place.googlePlaceId);

      setForm((currentForm) => ({
        ...currentForm,
        name: details.name,
        address: details.address || details.formattedAddress,
        neighborhood: details.neighborhood,
        city: details.city,
        state: formatState(details.state),
        postal_code: formatPostalCode(details.postalCode),
        latitude:
          details.latitude === null ? "" : String(details.latitude),
        longitude:
          details.longitude === null ? "" : String(details.longitude),
        google_place_id: details.googlePlaceId,
        google_maps_uri: details.googleMapsUri ?? "",
        google_rating: details.rating,
        google_user_rating_count: details.userRatingCount,
        google_business_status: details.businessStatus ?? "",
        google_primary_type: details.primaryType ?? "",
        google_display_name: details.name,
        google_formatted_address: details.formattedAddress,
        google_last_synced_at: new Date().toISOString(),
      }));
      setNearbyPlaces([]);
      setLocationMessage(
        "Dados do Google preenchidos. Revise o formulário e clique em Salvar posto para confirmar."
      );
    } catch (error) {
      console.error("Erro ao carregar posto do Google:", error);
      setLocationMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o posto selecionado."
      );
    } finally {
      setSelectingPlaceId(null);
    }
  }

  async function saveStation() {
    const name = form.name.trim();
    const latitude = parseCoordinate(form.latitude);
    const longitude = parseCoordinate(form.longitude);

    if (!name) {
      alert("Informe o nome do posto.");
      return;
    }

    if (
      form.latitude.trim() &&
      (
        latitude === null ||
        latitude < -90 ||
        latitude > 90
      )
    ) {
      alert("Informe uma latitude válida.");
      return;
    }

    if (
      form.longitude.trim() &&
      (
        longitude === null ||
        longitude < -180 ||
        longitude > 180
      )
    ) {
      alert("Informe uma longitude válida.");
      return;
    }

    if (
      (latitude === null && longitude !== null) ||
      (latitude !== null && longitude === null)
    ) {
      alert("Informe latitude e longitude juntas.");
      return;
    }

    try {
      setIsSaving(true);

      const ownerId = await getCurrentUserId();

      if (form.google_place_id) {
        const { data: duplicate, error: duplicateError } = await supabase
          .from("fuel_stations")
          .select("id")
          .eq("owner_id", ownerId)
          .eq("google_place_id", form.google_place_id)
          .maybeSingle();

        if (duplicateError) {
          throw new Error(duplicateError.message);
        }

        if (duplicate && duplicate.id !== editingStationId) {
          const existingStation = stations.find(
            (station) => station.id === duplicate.id
          );

          setLocationMessage("Este posto já está cadastrado na sua conta.");

          if (
            existingStation &&
            window.confirm("Este posto já está cadastrado. Deseja carregar o cadastro existente para edição?")
          ) {
            loadExistingStation(existingStation);
          }
          return;
        }
      }

      const payload = {
        owner_id: ownerId,
        name,
        brand: form.brand.trim() || null,
        address: form.address.trim() || null,
        neighborhood: form.neighborhood.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        postal_code: form.postal_code.trim() || null,
        latitude: editingGenericStation ? null : latitude,
        longitude: editingGenericStation ? null : longitude,
        google_place_id: editingGenericStation ? null : form.google_place_id || null,
        google_maps_uri: editingGenericStation ? null : form.google_maps_uri || null,
        google_rating: form.google_rating,
        google_user_rating_count: form.google_user_rating_count,
        google_business_status: form.google_business_status || null,
        google_primary_type: form.google_primary_type || null,
        google_display_name: form.google_display_name || null,
        google_formatted_address: form.google_formatted_address || null,
        google_last_synced_at: form.google_last_synced_at || null,
        active: form.active,
      };

      const { error } = editingStationId
        ? await supabase
            .from("fuel_stations")
            .update(payload)
            .eq("id", editingStationId)
            .eq("owner_id", ownerId)
        : await supabase
            .from("fuel_stations")
            .insert(payload);

      if (error) {
        if (error.code === "23505" && form.google_place_id) {
          throw new Error("Este posto já está cadastrado na sua conta.");
        }

        throw new Error(error.message);
      }

      closeDrawer();
      await loadStations();
    } catch (error) {
      console.error("Erro ao salvar posto:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Erro ao salvar posto."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleStationStatus(station: FuelStation) {
    const action = station.active ? "inativar" : "ativar";

    const confirmed = window.confirm(
      `Tem certeza que deseja ${action} o posto "${station.name}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      const ownerId = await getCurrentUserId();

      const { error } = await supabase
        .from("fuel_stations")
        .update({
          active: !station.active,
        })
        .eq("id", station.id)
        .eq("owner_id", ownerId);

      if (error) {
        throw error;
      }

      await loadStations();
    } catch (error) {
      console.error("Erro ao alterar status do posto:", error);
      alert("Erro ao alterar status do posto.");
    }
  }

  function openStationMap(station: FuelStation) {
    if (
      station.latitude === null ||
      station.longitude === null
    ) {
      alert("Este posto não possui localização cadastrada.");
      return;
    }

    const mapUrl =
      `https://www.google.com/maps/search/?api=1&query=` +
      `${station.latitude},${station.longitude}`;

    window.open(mapUrl, "_blank", "noopener,noreferrer");
  }

  const totalActiveStations = stations.filter(
    (station) => station.active
  ).length;

  const totalLocatedStations = stations.filter(
    (station) =>
      station.active &&
      station.latitude !== null &&
      station.longitude !== null
  ).length;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">
              Postos
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              Cadastre postos e localizações para identificar seus abastecimentos.
            </p>
          </div>

          <button
            type="button"
            onClick={openNewStationDrawer}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 md:w-auto"
          >
            <Plus size={18} />
            Novo posto
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-500/10 p-3 text-amber-300">
                <MapPin size={22} />
              </div>

              <div>
                <p className="text-sm text-slate-400">
                  Postos ativos
                </p>

                <p className="mt-1 text-2xl font-bold text-white">
                  {totalActiveStations}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-300">
                <LocateFixed size={22} />
              </div>

              <div>
                <p className="text-sm text-slate-400">
                  Com geolocalização
                </p>

                <p className="mt-1 text-2xl font-bold text-white">
                  {totalLocatedStations}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por posto, bandeira ou cidade..."
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
          />

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as StatusFilter
              )
            }
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="all">Todos</option>
          </select>
        </div>

        <div className="w-full overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-300">
              <tr>
                <th className="px-4 py-4">Posto</th>
                <th className="px-4 py-4">Bandeira</th>
                <th className="px-4 py-4">Endereço</th>
                <th className="px-4 py-4">Cidade / UF</th>
                <th className="px-4 py-4">Localização</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/10">
              {isLoading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-slate-400"
                  >
                    Carregando postos...
                  </td>
                </tr>
              )}

              {!isLoading &&
                filteredStations.map((station) => {
                  const hasLocation =
                    station.latitude !== null &&
                    station.longitude !== null;

                  return (
                    <tr
                      key={station.id}
                      className="hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-4">
                        <span className="font-semibold text-white">
                          {station.name}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-slate-300">
                        {station.brand ?? "-"}
                      </td>

                      <td className="max-w-[260px] truncate px-4 py-4 text-slate-300">
                        {station.address ?? "-"}
                      </td>

                      <td className="px-4 py-4 text-slate-300">
                        {[station.city, station.state]
                          .filter(Boolean)
                          .join(" / ") || "-"}
                      </td>

                      <td className="px-4 py-4">
                        {hasLocation ? (
                          <button
                            type="button"
                            onClick={() => openStationMap(station)}
                            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20"
                          >
                            <MapPin size={14} />
                            Ver mapa
                          </button>
                        ) : (
                          <span className="text-slate-500">
                            Não informada
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            station.active
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-slate-500/10 text-slate-400"
                          }`}
                        >
                          {station.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              openEditStationDrawer(station)
                            }
                            title="Editar"
                            className="rounded-lg p-2 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                          >
                            <Pencil size={18} />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              toggleStationStatus(station)
                            }
                            title={
                              station.active
                                ? "Inativar"
                                : "Ativar"
                            }
                            className={`rounded-lg p-2 ${
                              station.active
                                ? "text-red-400 hover:bg-red-500/10"
                                : "text-emerald-400 hover:bg-emerald-500/10"
                            }`}
                          >
                            {station.active ? (
                              <PowerOff size={18} />
                            ) : (
                              <Power size={18} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!isLoading &&
                filteredStations.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-10 text-center text-slate-400"
                    >
                      Nenhum posto encontrado.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>

      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-slate-950 p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {editingStationId
                    ? "Editar posto"
                    : "Novo posto"}
                </h2>

                <p className="text-sm text-slate-400">
                  Informe os dados e a localização do posto.
                </p>
              </div>

              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  Nome do posto *
                </label>

                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value,
                    })
                  }
                  placeholder="Ex.: Posto Avenida"
                  autoFocus
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  Bandeira
                </label>

                <input
                  value={form.brand}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      brand: event.target.value,
                    })
                  }
                  placeholder="Ex.: Shell, Ipiranga, Petrobras"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  Endereço
                </label>

                <input
                  value={form.address}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      address: event.target.value,
                    })
                  }
                  placeholder="Rua, avenida e número"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    Bairro
                  </label>

                  <input
                    value={form.neighborhood}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        neighborhood: event.target.value,
                      })
                    }
                    placeholder="Bairro"
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    CEP
                  </label>

                  <input
                    value={form.postal_code}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        postal_code: formatPostalCode(
                          event.target.value
                        ),
                      })
                    }
                    placeholder="00000-000"
                    inputMode="numeric"
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_100px]">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    Cidade
                  </label>

                  <input
                    value={form.city}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        city: event.target.value,
                      })
                    }
                    placeholder="Cidade"
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    UF
                  </label>

                  <input
                    value={form.state}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        state: formatState(event.target.value),
                      })
                    }
                    placeholder="SP"
                    maxLength={2}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 uppercase text-white outline-none placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-900 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-white">
                      Localizar postos próximos
                    </p>

                    <p className="mt-1 text-sm text-slate-400">
                      Use sua localização para escolher um posto real do Google.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={searchNearbyStations}
        disabled={isLocating || isSearchingNearby || editingGenericStation}
                    className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLocating || isSearchingNearby ? (
                      <LoaderCircle className="animate-spin" size={17} />
                    ) : (
                      <LocateFixed size={17} />
                    )}

                    {isLocating
                      ? "Obtendo localização precisa..."
                      : isSearchingNearby
                        ? "Buscando postos..."
                        : "Atualizar localização"}
                  </button>
                </div>

                {locationMessage && (
                  <p
                    role="status"
                    className="mt-4 rounded-lg bg-slate-950 px-3 py-2 text-sm text-slate-300"
                  >
                    {locationMessage}
                  </p>
                )}

                {nearbyPlaces.length > 0 && nearbyOrigin && (
                  <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                    <div className="max-h-[clamp(16rem,42vh,28rem)] space-y-2 overflow-y-auto pr-1" aria-label="Postos próximos">
                      {nearbyPlaces.map((place) => {
                        const distance = formatDistance(place.distanceMeters);
                        const isSelecting = selectingPlaceId === place.googlePlaceId;
                        const isHighlighted = highlightedPlaceId === place.googlePlaceId;
                        const isRegistered = registeredPlaceIds.has(place.googlePlaceId);

                        return (
                          <div
                            key={place.googlePlaceId}
                            className={`rounded-xl border p-3 transition ${
                              isHighlighted
                                ? "border-amber-400/60 bg-amber-500/10"
                                : "border-white/10 bg-slate-950"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setHighlightedPlaceId(place.googlePlaceId)}
                              className="w-full text-left"
                            >
                              <p className="font-semibold text-white">{place.name}</p>
                              <p className="mt-1 text-xs text-slate-400">
                                {place.formattedAddress || "Endereço não informado pelo Google"}
                              </p>
                              {distance && (
                                <p className="mt-1 text-xs font-medium text-cyan-300">
                                  Aproximadamente {distance}
                                </p>
                              )}
                              {isRegistered && (
                                <p className="mt-1 text-xs font-semibold text-emerald-300">
                                  Já cadastrado
                                </p>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => selectNearbyStation(place)}
                              disabled={selectingPlaceId !== null}
                              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/30 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSelecting && <LoaderCircle className="animate-spin" size={15} />}
                              {isSelecting
                                ? "Carregando..."
                                : isRegistered
                                  ? "Carregar cadastro"
                                  : "Selecionar"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <NearbyFuelStationsMap
                      userLocation={nearbyOrigin}
                      places={nearbyPlaces}
                      highlightedPlaceId={highlightedPlaceId}
                      registeredPlaceIds={registeredPlaceIds}
                      onHighlight={setHighlightedPlaceId}
                      onSelect={selectNearbyStation}
                      selectingPlaceId={selectingPlaceId}
                    />
                  </div>
                )}

                {form.google_place_id && (
                  <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2">
                    <p className="text-xs font-semibold text-emerald-300">
                      Posto selecionado do Google Places
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-400">
                      Place ID: {form.google_place_id}
                    </p>
                  </div>
                )}

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      Latitude
                    </label>

                    <input
                      value={form.latitude}
                      disabled={editingGenericStation}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          latitude: event.target.value,
                        })
                      }
                      placeholder="-23.0000000"
                      inputMode="decimal"
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-600"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      Longitude
                    </label>

                    <input
                      value={form.longitude}
                      disabled={editingGenericStation}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          longitude: event.target.value,
                        })
                      }
                      placeholder="-46.0000000"
                      inputMode="decimal"
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-600"
                    />
                  </div>
                </div>
              </div>

              {editingStationId && (
                <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-900 p-4">
                  <div>
                    <p className="font-semibold text-white">
                      Posto ativo
                    </p>

                    <p className="mt-1 text-sm text-slate-400">
                      Postos inativos não aparecem em novos abastecimentos.
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.active}
                    onClick={() =>
                      setForm({
                        ...form,
                        active: !form.active,
                      })
                    }
                    className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                      form.active
                        ? "bg-emerald-600"
                        : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                        form.active
                          ? "left-6"
                          : "left-1"
                      }`}
                    />
                  </button>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeDrawer}
                  disabled={isSaving}
                  className="w-full rounded-xl border border-white/10 px-5 py-3 font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={saveStation}
                  disabled={isSaving}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check size={18} />

                  {isSaving
                    ? "Salvando..."
                    : editingStationId
                      ? "Atualizar posto"
                      : "Salvar posto"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
