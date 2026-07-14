"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/src/hooks/useAuth";
import {
  loadAnalyticsDataset,
  loadAnalyticsReferenceData,
} from "@/src/services/analyticsService";
import type {
  AnalyticsAccount,
  AnalyticsCategory,
  AnalyticsCompetence,
  AnalyticsFilters,
  AnalyticsTransaction,
} from "@/src/types/analytics";

type AnalyticsContextValue = {
  accounts: AnalyticsAccount[];
  categories: AnalyticsCategory[];
  competences: AnalyticsCompetence[];
  selectedCompetences: AnalyticsCompetence[];
  transactions: AnalyticsTransaction[];
  openingBalance: number;
  filters: AnalyticsFilters;
  setFilter: (name: keyof AnalyticsFilters, value: string) => void;
  isLoading: boolean;
  error: string;
};

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

const emptyFilters: AnalyticsFilters = {
  competenceId: "",
  accountId: "",
  categoryId: "",
  status: "",
};

function getDefaultCompetenceId(competences: AnalyticsCompetence[]) {
  const today = new Date();
  return (
    competences.find(
      (competence) =>
        competence.month === today.getMonth() + 1 &&
        competence.year === today.getFullYear()
    )?.id ??
    competences[0]?.id ??
    ""
  );
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading: isAuthLoading } = useAuth();
  const [accounts, setAccounts] = useState<AnalyticsAccount[]>([]);
  const [categories, setCategories] = useState<AnalyticsCategory[]>([]);
  const [competences, setCompetences] = useState<AnalyticsCompetence[]>([]);
  const [transactions, setTransactions] = useState<AnalyticsTransaction[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [filters, setFilters] = useState<AnalyticsFilters>(emptyFilters);
  const [isLoadingReference, setIsLoadingReference] = useState(true);
  const [isLoadingDataset, setIsLoadingDataset] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthLoading) return;

    if (!user) {
      return;
    }

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
        setFilters((current) => ({
          ...current,
          competenceId:
            current.competenceId ||
            getDefaultCompetenceId(referenceData.competences),
        }));
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Erro ao carregar os filtros de análises."
          );
        }
      } finally {
        if (active) setIsLoadingReference(false);
      }
    }

    loadReferenceData();
    return () => {
      active = false;
    };
  }, [isAuthLoading, user]);

  const selectedCompetences = useMemo(() => {
    const selectedIndex = competences.findIndex(
      (competence) => competence.id === filters.competenceId
    );

    if (selectedIndex < 0) return [];
    return competences.slice(selectedIndex, selectedIndex + 12).reverse();
  }, [competences, filters.competenceId]);

  const competenceIds = useMemo(
    () => selectedCompetences.map((competence) => competence.id),
    [selectedCompetences]
  );
  const datasetFilters = useMemo(
    () =>
      pathname === "/analytics/cash-flow"
        ? { ...filters, categoryId: "" }
        : filters,
    [filters, pathname]
  );

  useEffect(() => {
    if (
      !user ||
      !datasetFilters.competenceId ||
      competenceIds.length === 0
    ) {
      return;
    }

    const ownerId = user.id;
    let active = true;

    async function loadDataset() {
      setIsLoadingDataset(true);
      setError("");

      try {
        const dataset = await loadAnalyticsDataset(
          ownerId,
          competenceIds,
          datasetFilters
        );
        if (!active) return;
        setTransactions(dataset.transactions);
        setOpeningBalance(dataset.openingBalance);
      } catch (loadError) {
        if (active) {
          setTransactions([]);
          setOpeningBalance(0);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Erro ao carregar os dados analíticos."
          );
        }
      } finally {
        if (active) setIsLoadingDataset(false);
      }
    }

    loadDataset();
    return () => {
      active = false;
    };
  }, [competenceIds, datasetFilters, user]);

  function setFilter(name: keyof AnalyticsFilters, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  return (
    <AnalyticsContext.Provider
      value={{
        accounts: user ? accounts : [],
        categories: user ? categories : [],
        competences: user ? competences : [],
        selectedCompetences: user ? selectedCompetences : [],
        transactions: user ? transactions : [],
        openingBalance: user ? openingBalance : 0,
        filters,
        setFilter,
        isLoading:
          isAuthLoading || (Boolean(user) && (isLoadingReference || isLoadingDataset)),
        error:
          !isAuthLoading && !user ? "Usuário não autenticado." : error,
      }}
    >
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error("useAnalytics deve ser usado dentro de AnalyticsProvider.");
  }
  return context;
}
