"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/src/hooks/useAuth";
import { loadAnalyticsDataset, loadAnalyticsReferenceData } from "@/src/services/analyticsService";
import type {
  AnalyticsAccount,
  AnalyticsCategory,
  AnalyticsCompetence,
  AnalyticsFilters,
  AnalyticsFinancialTarget,
  AnalyticsTransaction,
} from "@/src/types/analytics";
import { resolveAnalyticsDatasetFilters } from "@/src/utils/analyticsFilters";
import { getComparisonDateRange, normalizeAnalyticsDateRange } from "@/src/utils/analyticsPredictive";

type AnalyticsContextValue = {
  accounts: AnalyticsAccount[];
  categories: AnalyticsCategory[];
  competences: AnalyticsCompetence[];
  selectedCompetences: AnalyticsCompetence[];
  transactions: AnalyticsTransaction[];
  financialTargets: AnalyticsFinancialTarget[];
  openingBalance: number;
  filters: AnalyticsFilters;
  setFilter: (name: keyof AnalyticsFilters, value: string) => void;
  setDateRange: (startDate: string, endDate: string) => void;
  includePendingCashFlow: boolean;
  setIncludePendingCashFlow: (include: boolean) => void;
  isLoading: boolean;
  error: string;
};

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

const emptyFilters: AnalyticsFilters = {
  competenceId: "",
  accountId: "",
  categoryId: "",
  status: "",
  startDate: "",
  endDate: "",
};

function getDefaultCompetenceId(competences: AnalyticsCompetence[]) {
  const today = new Date();
  return competences.find((item) => item.month === today.getMonth() + 1 && item.year === today.getFullYear())?.id ?? competences[0]?.id ?? "";
}

function competenceStart(competence: AnalyticsCompetence) {
  return `${competence.year}-${String(competence.month).padStart(2, "0")}-01`;
}

function competenceEnd(competence: AnalyticsCompetence) {
  return new Date(Date.UTC(competence.year, competence.month, 0)).toISOString().slice(0, 10);
}

function getTrailingCompetences(competences: AnalyticsCompetence[], competenceId: string) {
  const index = competences.findIndex((item) => item.id === competenceId);
  return index < 0 ? [] : competences.slice(index, index + 12).reverse();
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading: isAuthLoading } = useAuth();
  const [accounts, setAccounts] = useState<AnalyticsAccount[]>([]);
  const [categories, setCategories] = useState<AnalyticsCategory[]>([]);
  const [competences, setCompetences] = useState<AnalyticsCompetence[]>([]);
  const [transactions, setTransactions] = useState<AnalyticsTransaction[]>([]);
  const [financialTargets, setFinancialTargets] = useState<AnalyticsFinancialTarget[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [filters, setFilters] = useState<AnalyticsFilters>(emptyFilters);
  const [includePendingCashFlow, setIncludePendingCashFlow] = useState(false);
  const [isLoadingReference, setIsLoadingReference] = useState(true);
  const [isLoadingDataset, setIsLoadingDataset] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthLoading || !user) return;
    const ownerId = user.id;
    let active = true;

    async function loadReferenceData() {
      setIsLoadingReference(true);
      setError("");
      try {
        const referenceData = await loadAnalyticsReferenceData(ownerId);
        if (!active) return;
        setAccounts(referenceData.accounts);
        setCategories(referenceData.categories);
        setCompetences(referenceData.competences);
        setFilters((current) => {
          if (current.competenceId && current.startDate && current.endDate) return current;
          const competenceId = getDefaultCompetenceId(referenceData.competences);
          const trailing = getTrailingCompetences(referenceData.competences, competenceId);
          return {
            ...current,
            competenceId,
            startDate: trailing[0] ? competenceStart(trailing[0]) : "",
            endDate: trailing.at(-1) ? competenceEnd(trailing.at(-1)!) : "",
          };
        });
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Erro ao carregar os filtros de análises.");
      } finally {
        if (active) setIsLoadingReference(false);
      }
    }

    loadReferenceData();
    return () => { active = false; };
  }, [isAuthLoading, user]);

  const selectedCompetences = useMemo(() => {
    if (!filters.startDate || !filters.endDate || filters.startDate > filters.endDate) return [];
    return [...competences]
      .filter((item) => competenceEnd(item) >= filters.startDate && competenceStart(item) <= filters.endDate)
      .sort((left, right) => left.year - right.year || left.month - right.month);
  }, [competences, filters.endDate, filters.startDate]);

  const comparisonRange = useMemo(() => {
    try {
      return getComparisonDateRange(normalizeAnalyticsDateRange(filters.startDate, filters.endDate));
    } catch {
      return null;
    }
  }, [filters.endDate, filters.startDate]);

  const queryCompetences = useMemo(() => {
    if (!comparisonRange) return [];
    return [...competences]
      .filter((item) => competenceEnd(item) >= comparisonRange.startDate && competenceStart(item) <= filters.endDate)
      .sort((left, right) => left.year - right.year || left.month - right.month);
  }, [comparisonRange, competences, filters.endDate]);

  const competenceIds = useMemo(() => queryCompetences.map((item) => item.id), [queryCompetences]);
  const selectedCompetenceIds = useMemo(() => selectedCompetences.map((item) => item.id), [selectedCompetences]);
  const datasetFilters = useMemo(() => resolveAnalyticsDatasetFilters(pathname, filters), [filters, pathname]);

  useEffect(() => {
    if (!user || !datasetFilters.competenceId || !comparisonRange || competenceIds.length === 0) return;
    const ownerId = user.id;
    let active = true;

    async function loadDataset() {
      setIsLoadingDataset(true);
      setError("");
      try {
        const dataset = await loadAnalyticsDataset(
          ownerId,
          competenceIds,
          { ...datasetFilters, startDate: comparisonRange!.startDate, endDate: filters.endDate },
          selectedCompetenceIds
        );
        if (!active) return;
        setTransactions(dataset.transactions);
        setFinancialTargets(dataset.financialTargets);
        setOpeningBalance(dataset.openingBalance);
      } catch (loadError) {
        if (active) {
          setTransactions([]);
          setFinancialTargets([]);
          setOpeningBalance(0);
          setError(loadError instanceof Error ? loadError.message : "Erro ao carregar os dados analíticos.");
        }
      } finally {
        if (active) setIsLoadingDataset(false);
      }
    }

    loadDataset();
    return () => { active = false; };
  }, [comparisonRange, competenceIds, datasetFilters, filters.endDate, selectedCompetenceIds, user]);

  function setFilter(name: keyof AnalyticsFilters, value: string) {
    setFilters((current) => {
      if (name !== "competenceId") return { ...current, [name]: value };
      const trailing = getTrailingCompetences(competences, value);
      return {
        ...current,
        competenceId: value,
        startDate: trailing[0] ? competenceStart(trailing[0]) : current.startDate,
        endDate: trailing.at(-1) ? competenceEnd(trailing.at(-1)!) : current.endDate,
      };
    });
  }

  function setDateRange(startDate: string, endDate: string) {
    setFilters((current) => ({ ...current, startDate, endDate }));
  }

  const dateError = filters.startDate && filters.endDate && filters.startDate > filters.endDate
    ? "A data inicial não pode ser posterior à data final."
    : "";

  return (
    <AnalyticsContext.Provider value={{
      accounts: user ? accounts : [],
      categories: user ? categories : [],
      competences: user ? competences : [],
      selectedCompetences: user ? selectedCompetences : [],
      transactions: user ? transactions : [],
      financialTargets: user ? financialTargets : [],
      openingBalance: user ? openingBalance : 0,
      filters,
      setFilter,
      setDateRange,
      includePendingCashFlow,
      setIncludePendingCashFlow,
      isLoading: isAuthLoading || (Boolean(user) && (isLoadingReference || isLoadingDataset)),
      error: !isAuthLoading && !user ? "Usuário não autenticado." : dateError || error,
    }}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (!context) throw new Error("useAnalytics deve ser usado dentro de AnalyticsProvider.");
  return context;
}
