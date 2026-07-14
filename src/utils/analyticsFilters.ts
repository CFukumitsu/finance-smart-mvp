import type { AnalyticsFilters } from "@/src/types/analytics";

export function resolveAnalyticsDatasetFilters(
  pathname: string,
  filters: AnalyticsFilters
): AnalyticsFilters {
  if (pathname === "/analytics/cash-flow") {
    return { ...filters, categoryId: "", status: "" };
  }

  return filters;
}
