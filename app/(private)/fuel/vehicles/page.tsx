"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Car,
  Check,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Star,
  X,
} from "lucide-react";
import AppShell from "../../../components/layout/AppShell";
import { getCurrentUserId, supabase } from "@/src/lib/supabase";

type Vehicle = {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  model_year: number | null;
  plate: string | null;
  fuel_type: string;
  tank_capacity: number | null;
  initial_odometer: number | null;
  is_default: boolean;
  active: boolean;
  created_at: string;
};

type VehicleStatusFilter = "active" | "inactive" | "all";

const fuelTypes = [
  "Gasolina",
  "Etanol",
  "Flex",
  "Diesel",
  "Elétrico",
  "Híbrido",
  "GNV",
  "Outro",
];

const emptyForm = {
  name: "",
  brand: "",
  model: "",
  model_year: "",
  plate: "",
  fuel_type: "Flex",
  tank_capacity: "",
  initial_odometer: "",
  is_default: false,
  active: true,
};

export default function VehiclesPage() {
  const router = useRouter();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<VehicleStatusFilter>("active");

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadVehicles();
  }, []);

  async function loadVehicles() {
    try {
      setIsLoading(true);
  
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
  
      if (userError || !user) {
        router.replace("/login?next=/vehicles");
        return;
      }
  
      const { data, error } = await supabase
        .from("vehicles")
        .select(`
          id,
          name,
          brand,
          model,
          model_year,
          plate,
          fuel_type,
          tank_capacity,
          initial_odometer,
          is_default,
          active,
          created_at
        `)
        .eq("owner_id", user.id)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });
  
      if (error) {
        throw error;
      }
  
      setVehicles((data ?? []) as Vehicle[]);
    } catch (error) {
      console.error("Erro ao carregar veículos:", error);
  
      alert(
        error instanceof Error
          ? error.message
          : "Erro ao carregar veículos."
      );
    } finally {
      setIsLoading(false);
    }
  }

  const filteredVehicles = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return vehicles.filter((vehicle) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && vehicle.active) ||
        (statusFilter === "inactive" && !vehicle.active);

      if (!matchesStatus) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableContent = [
        vehicle.name,
        vehicle.brand,
        vehicle.model,
        vehicle.plate,
        vehicle.fuel_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableContent.includes(normalizedSearch);
    });
  }, [vehicles, searchTerm, statusFilter]);

  function formatDecimalInput(value: string) {
    return value
      .replace(/[^\d,]/g, "")
      .replace(/(,.*),/g, "$1");
  }

  function parseDecimalInput(value: string) {
    if (!value.trim()) {
      return null;
    }

    const parsedValue = Number(value.replace(",", "."));

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  function formatDecimalValue(value: number | null) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value).replace(".", ",");
  }

  function formatPlate(value: string) {
    return value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 7);
  }

  function resetForm() {
    setEditingVehicleId(null);
    setForm(emptyForm);
  }

  function openNewVehicleDrawer() {
    resetForm();

    const hasDefaultVehicle = vehicles.some(
      (vehicle) => vehicle.active && vehicle.is_default
    );

    setForm({
      ...emptyForm,
      is_default: !hasDefaultVehicle,
    });

    setIsDrawerOpen(true);
  }

  function openEditVehicleDrawer(vehicle: Vehicle) {
    setEditingVehicleId(vehicle.id);

    setForm({
      name: vehicle.name ?? "",
      brand: vehicle.brand ?? "",
      model: vehicle.model ?? "",
      model_year: vehicle.model_year
        ? String(vehicle.model_year)
        : "",
      plate: vehicle.plate ?? "",
      fuel_type: vehicle.fuel_type ?? "Flex",
      tank_capacity: formatDecimalValue(vehicle.tank_capacity),
      initial_odometer: formatDecimalValue(vehicle.initial_odometer),
      is_default: vehicle.is_default,
      active: vehicle.active,
    });

    setIsDrawerOpen(true);
  }

  function closeDrawer() {
    resetForm();
    setIsDrawerOpen(false);
  }

  async function saveVehicle() {
    const name = form.name.trim();
    const modelYear = form.model_year
      ? Number(form.model_year)
      : null;

    const tankCapacity = parseDecimalInput(form.tank_capacity);
    const initialOdometer = parseDecimalInput(form.initial_odometer);

    if (!name) {
      alert("Informe o nome do veículo.");
      return;
    }

    if (
      modelYear !== null &&
      (
        !Number.isInteger(modelYear) ||
        modelYear < 1900 ||
        modelYear > 2200
      )
    ) {
      alert("Informe um ano válido.");
      return;
    }

    if (
      form.tank_capacity.trim() &&
      (tankCapacity === null || tankCapacity <= 0)
    ) {
      alert("Informe uma capacidade de tanque válida.");
      return;
    }

    if (
      form.initial_odometer.trim() &&
      (initialOdometer === null || initialOdometer < 0)
    ) {
      alert("Informe um hodômetro inicial válido.");
      return;
    }

    try {
      setIsSaving(true);

      const ownerId = await getCurrentUserId();

      const payload = {
        owner_id: ownerId,
        name,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        model_year: modelYear,
        plate: form.plate.trim() || null,
        fuel_type: form.fuel_type,
        tank_capacity: tankCapacity,
        initial_odometer: initialOdometer,
        is_default: form.active ? form.is_default : false,
        active: form.active,
      };

      const { error } = editingVehicleId
        ? await supabase
            .from("vehicles")
            .update(payload)
            .eq("id", editingVehicleId)
            .eq("owner_id", ownerId)
        : await supabase
            .from("vehicles")
            .insert(payload);

      if (error) {
        if (
          error.code === "23505" &&
          error.message.toLowerCase().includes("plate")
        ) {
          alert("Já existe um veículo cadastrado com esta placa.");
          return;
        }

        throw error;
      }

      closeDrawer();
      await loadVehicles();
    } catch (error) {
      console.error("Erro ao salvar veículo:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Erro ao salvar veículo."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function setDefaultVehicle(vehicle: Vehicle) {
    if (!vehicle.active) {
      alert("Ative o veículo antes de defini-lo como padrão.");
      return;
    }

    if (vehicle.is_default) {
      return;
    }

    try {
      const ownerId = await getCurrentUserId();

      const { error } = await supabase
        .from("vehicles")
        .update({
          is_default: true,
        })
        .eq("id", vehicle.id)
        .eq("owner_id", ownerId);

      if (error) {
        throw error;
      }

      await loadVehicles();
    } catch (error) {
      console.error("Erro ao definir veículo padrão:", error);
      alert("Erro ao definir veículo padrão.");
    }
  }

  async function toggleVehicleStatus(vehicle: Vehicle) {
    const action = vehicle.active ? "inativar" : "ativar";

    const confirmed = window.confirm(
      `Tem certeza que deseja ${action} o veículo "${vehicle.name}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      const ownerId = await getCurrentUserId();

      const { error } = await supabase
        .from("vehicles")
        .update({
          active: !vehicle.active,
          is_default: vehicle.active ? false : vehicle.is_default,
        })
        .eq("id", vehicle.id)
        .eq("owner_id", ownerId);

      if (error) {
        throw error;
      }

      await loadVehicles();
    } catch (error) {
      console.error("Erro ao alterar status do veículo:", error);
      alert("Erro ao alterar status do veículo.");
    }
  }

  const totalActiveVehicles = vehicles.filter(
    (vehicle) => vehicle.active
  ).length;

  const defaultVehicle = vehicles.find(
    (vehicle) => vehicle.active && vehicle.is_default
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">
              Veículos
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              Cadastre os veículos utilizados no controle de combustível.
            </p>
          </div>

          <button
            type="button"
            onClick={openNewVehicleDrawer}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 md:w-auto"
          >
            <Plus size={18} />
            Novo veículo
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-3 text-blue-300">
                <Car size={22} />
              </div>

              <div>
                <p className="text-sm text-slate-400">
                  Veículos ativos
                </p>

                <p className="mt-1 text-2xl font-bold text-white">
                  {totalActiveVehicles}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 md:col-span-2">
            <p className="text-sm text-slate-400">
              Veículo padrão
            </p>

            <div className="mt-2 flex items-center gap-2">
              <Star
                size={20}
                className={
                  defaultVehicle
                    ? "fill-amber-300 text-amber-300"
                    : "text-slate-600"
                }
              />

              <p className="text-xl font-bold text-white">
                {defaultVehicle?.name ??
                  "Nenhum veículo padrão definido"}
              </p>
            </div>

            {defaultVehicle && (
              <p className="mt-1 text-sm text-slate-400">
                Será selecionado automaticamente nos abastecimentos.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por nome, modelo ou placa..."
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
          />

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as VehicleStatusFilter
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
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-300">
              <tr>
                <th className="px-4 py-4">Veículo</th>
                <th className="px-4 py-4">Marca / Modelo</th>
                <th className="px-4 py-4">Ano</th>
                <th className="px-4 py-4">Placa</th>
                <th className="px-4 py-4">Combustível</th>
                <th className="px-4 py-4">Tanque</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/10">
              {isLoading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-slate-400"
                  >
                    Carregando veículos...
                  </td>
                </tr>
              )}

              {!isLoading &&
                filteredVehicles.map((vehicle) => (
                  <tr
                    key={vehicle.id}
                    className="hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">
                          {vehicle.name}
                        </span>

                        {vehicle.is_default && vehicle.active && (
                          <span
                            title="Veículo padrão"
                            className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-300"
                          >
                            <Star
                              size={12}
                              className="fill-amber-300"
                            />
                            Padrão
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-slate-300">
                      {[vehicle.brand, vehicle.model]
                        .filter(Boolean)
                        .join(" ") || "-"}
                    </td>

                    <td className="px-4 py-4 text-slate-300">
                      {vehicle.model_year ?? "-"}
                    </td>

                    <td className="px-4 py-4 font-medium text-slate-300">
                      {vehicle.plate ?? "-"}
                    </td>

                    <td className="px-4 py-4 text-slate-300">
                      {vehicle.fuel_type}
                    </td>

                    <td className="px-4 py-4 text-slate-300">
                      {vehicle.tank_capacity !== null
                        ? `${Number(
                            vehicle.tank_capacity
                          ).toLocaleString("pt-BR")} L`
                        : "-"}
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          vehicle.active
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-slate-500/10 text-slate-400"
                        }`}
                      >
                        {vehicle.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1">
                        {vehicle.active &&
                          !vehicle.is_default && (
                            <button
                              type="button"
                              onClick={() =>
                                setDefaultVehicle(vehicle)
                              }
                              title="Definir como veículo padrão"
                              className="rounded-lg p-2 text-amber-300 hover:bg-amber-500/10"
                            >
                              <Star size={18} />
                            </button>
                          )}

                        <button
                          type="button"
                          onClick={() =>
                            openEditVehicleDrawer(vehicle)
                          }
                          title="Editar"
                          className="rounded-lg p-2 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                        >
                          <Pencil size={18} />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            toggleVehicleStatus(vehicle)
                          }
                          title={
                            vehicle.active
                              ? "Inativar"
                              : "Ativar"
                          }
                          className={`rounded-lg p-2 ${
                            vehicle.active
                              ? "text-red-400 hover:bg-red-500/10"
                              : "text-emerald-400 hover:bg-emerald-500/10"
                          }`}
                        >
                          {vehicle.active ? (
                            <PowerOff size={18} />
                          ) : (
                            <Power size={18} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

              {!isLoading &&
                filteredVehicles.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-10 text-center text-slate-400"
                    >
                      Nenhum veículo encontrado.
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
                  {editingVehicleId
                    ? "Editar veículo"
                    : "Novo veículo"}
                </h2>

                <p className="text-sm text-slate-400">
                  Informe os dados utilizados no controle de
                  abastecimentos.
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
                  Nome do veículo *
                </label>

                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value,
                    })
                  }
                  placeholder="Ex.: Creta"
                  autoFocus
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    Marca
                  </label>

                  <input
                    value={form.brand}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        brand: event.target.value,
                      })
                    }
                    placeholder="Ex.: Hyundai"
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    Modelo
                  </label>

                  <input
                    value={form.model}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        model: event.target.value,
                      })
                    }
                    placeholder="Ex.: Creta Platinum"
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    Ano
                  </label>

                  <input
                    value={form.model_year}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        model_year: event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 4),
                      })
                    }
                    placeholder="Ex.: 2025"
                    inputMode="numeric"
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    Placa
                  </label>

                  <input
                    value={form.plate}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        plate: formatPlate(event.target.value),
                      })
                    }
                    placeholder="Ex.: ABC1D23"
                    maxLength={7}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 uppercase text-white outline-none placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  Tipo de combustível
                </label>

                <select
                  value={form.fuel_type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      fuel_type: event.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                >
                  {fuelTypes.map((fuelType) => (
                    <option
                      key={fuelType}
                      value={fuelType}
                    >
                      {fuelType}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    Capacidade do tanque
                  </label>

                  <div className="relative">
                    <input
                      value={form.tank_capacity}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          tank_capacity: formatDecimalInput(
                            event.target.value
                          ),
                        })
                      }
                      placeholder="Ex.: 50"
                      inputMode="decimal"
                      className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 pr-10 text-white outline-none placeholder:text-slate-500"
                    />

                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-slate-500">
                      L
                    </span>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    Hodômetro inicial
                  </label>

                  <div className="relative">
                    <input
                      value={form.initial_odometer}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          initial_odometer: formatDecimalInput(
                            event.target.value
                          ),
                        })
                      }
                      placeholder="Ex.: 18450"
                      inputMode="decimal"
                      className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 pr-12 text-white outline-none placeholder:text-slate-500"
                    />

                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-slate-500">
                      km
                    </span>
                  </div>
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-900 p-4">
                <div>
                  <p className="font-semibold text-white">
                    Veículo padrão
                  </p>

                  <p className="mt-1 text-sm text-slate-400">
                    Será selecionado automaticamente em novos
                    abastecimentos.
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={form.is_default}
                  onClick={() =>
                    setForm({
                      ...form,
                      is_default: !form.is_default,
                      active: true,
                    })
                  }
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                    form.is_default
                      ? "bg-blue-600"
                      : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                      form.is_default
                        ? "left-6"
                        : "left-1"
                    }`}
                  />
                </button>
              </label>

              {editingVehicleId && (
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-900 p-4">
                  <div>
                    <p className="font-semibold text-white">
                      Veículo ativo
                    </p>

                    <p className="mt-1 text-sm text-slate-400">
                      Veículos inativos não aparecem em novos
                      abastecimentos.
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
                        is_default: !form.active
                          ? form.is_default
                          : false,
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
                </label>
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
                  onClick={saveVehicle}
                  disabled={isSaving}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check size={18} />

                  {isSaving
                    ? "Salvando..."
                    : editingVehicleId
                      ? "Atualizar veículo"
                      : "Salvar veículo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}