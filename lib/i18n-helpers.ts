import { useTranslations } from "next-intl";

/**
 * Resolve a numeric score to a grade label using the common.grade.* namespace.
 * Hook variant for use inside components.
 */
export function useGradeLabel() {
  const t = useTranslations("common.grade");
  return (score: number): string => {
    if (score >= 95) return t("excellent");
    if (score >= 85) return t("performingWell");
    if (score >= 70) return t("solidFoundation");
    if (score >= 50) return t("roomToGrow");
    return t("needsWork");
  };
}

/**
 * Resolve a numeric score to a locale-aware date format.
 */
export function useFormatDate() {
  const t = useTranslations("common.locale");
  const tag = t("tag");
  return (dateStr: string): string =>
    new Date(dateStr).toLocaleDateString(tag, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
}
