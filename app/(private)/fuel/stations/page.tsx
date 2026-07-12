"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  LocateFixed,
  MapPin,
  Pencil,
  Plus,
  Power,
  PowerOff,
  X,
} from "lucide-react";
import AppShell from "../../../components/layout/AppShell";
import { getCurrentUserId, supabase } from "@/src/lib/supabase";

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
  active: boolean;
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
  active: true,
};

export default function FuelStationsPage() {
  const [stations, setStations] = useState<FuelStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

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

      const { data, error } = await supabase
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
          active,
          created_at
        `)
        .eq("owner_id", ownerId)
        .order("name", { ascending: true });

      if (error) {
        throw error;
      }

      setStations((data ?? []) as FuelStation[]);
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

  function resetForm() {
    setEditingStationId(null);
    setForm(emptyForm);
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
      active: station.active,
    });

    setIsDrawerOpen(true);
  }

  function closeDrawer() {
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

  function requestCurrentLocation() {
    if (!navigator.geolocation) {
      alert("A geolocalização não é suportada neste navegador.");
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude.toFixed(7);
        const longitude = position.coords.longitude.toFixed(7);

        setForm((currentForm) => ({
          ...currentForm,
          latitude,
          longitude,
        }));

        setIsLocating(false);
      },
      (error) => {
        console.error("Erro ao obter localização:", error);

        if (error.code === error.PERMISSION_DENIED) {
          alert(
            "A permissão de localização foi negada. Libere o acesso à localização no navegador."
          );
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          alert("Não foi possível determinar sua localização.");
        } else if (error.code === error.TIMEOUT) {
          alert("A localização demorou muito para responder.");
        } else {
          alert("Erro ao obter sua localização.");
        }

        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      }
    );
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

      const payload = {
        owner_id: ownerId,
        name,
        brand: form.brand.trim() || null,
        address: form.address.trim() || null,
        neighborhood: form.neighborhood.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        postal_code: form.postal_code.trim() || null,
        latitude,
        longitude,
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
        throw error;
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
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">
                      Geolocalização
                    </p>

                    <p className="mt-1 text-sm text-slate-400">
                      Use a localização atual quando estiver no posto.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={requestCurrentLocation}
                    disabled={isLocating}
                    className="flex shrink-0 items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <LocateFixed size={17} />

                    {isLocating
                      ? "Localizando..."
                      : "Usar localização"}
                  </button>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      Latitude
                    </label>

                    <input
                      value={form.latitude}
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