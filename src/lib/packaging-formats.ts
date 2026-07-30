import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type PackagingFormat = Tables<"packaging_formats">;

export const FORMAT_TYPES = [
  { value: "flower", label: "Fleur" },
  { value: "preroll", label: "Pré-roulé" },
  { value: "bulk", label: "Bulk" },
  { value: "sample", label: "Échantillon" },
  { value: "retention", label: "Rétention" },
] as const;

export const FORMAT_TYPE_CLASS: Record<string, string> = {
  flower: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  preroll: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  bulk: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  sample: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  retention: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

export const formatTypeLabel = (v: string | null | undefined) =>
  FORMAT_TYPES.find((t) => t.value === v)?.label ?? v ?? "—";

/** Format à poids libre (bulk, échantillon, rétention) : le poids est saisi. */
export const isFreeWeightFormat = (
  f: Pick<PackagingFormat, "is_free_weight" | "net_weight_grams"> | null | undefined,
) => !!f && (f.is_free_weight || f.net_weight_grams == null);

/** Poids par unité du format (g). 0 pour un format à poids libre. */
export const formatUnitGrams = (f: Pick<PackagingFormat, "units_per_pack" | "unit_weight_grams" | "net_weight_grams">) => {
  const u = Number(f.unit_weight_grams ?? 0);
  if (u > 0) return u;
  const per = Number(f.units_per_pack ?? 0) || 1;
  return Number(f.net_weight_grams ?? 0) / per;
};

/** Poids net calculé dynamiquement (jamais figé côté UI). */
export const formatNetGrams = (f: Pick<PackagingFormat, "units_per_pack" | "unit_weight_grams" | "net_weight_grams">) => {
  const computed = Number(f.units_per_pack ?? 0) * Number(f.unit_weight_grams ?? 0);
  return computed > 0 ? computed : Number(f.net_weight_grams ?? 0);
};

export const formatLabel = (f: PackagingFormat | null | undefined) => {
  if (!f) return "—";
  return isFreeWeightFormat(f) ? f.name : `${f.name} — ${formatUnitGrams(f)} g / unité`;
};


/**
 * Cohérence type de contenant → familles de formats autorisées (catalogue).
 * Chaque type de contenant doit pointer vers une famille du catalogue :
 * aucune saisie de format libre n'est permise en inventaire.
 */
export const FORMAT_TYPES_FOR_CONTAINER: Record<string, string[]> = {
  packaged: ["flower", "preroll"],
  preroll: ["preroll"],
  bulk: ["bulk"],
  trim: ["bulk"],
  sample: ["sample"],
  lab_sample: ["sample"],
  retention: ["retention"],
  other: ["bulk", "sample"],
};

/** Formats catalogue cohérents avec le type de contenant. */
export function formatsForContainerType(list: PackagingFormat[], type: string) {
  const allowed = FORMAT_TYPES_FOR_CONTAINER[type];
  if (!allowed) return [];
  return list.filter(
    (f) =>
      allowed.includes(f.format_type) &&
      f.is_active &&
      (isFreeWeightFormat(f) || formatUnitGrams(f) > 0),
  );
}




export async function fetchPackagingFormats(activeOnly = true) {
  let q = supabase
    .from("packaging_formats")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PackagingFormat[];
}

/** Charge les formats (actifs par défaut) — aucune liste hardcodée dans l'UI. */
export function usePackagingFormats(activeOnly = true) {
  const [formats, setFormats] = useState<PackagingFormat[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      setFormats(await fetchPackagingFormats(activeOnly));
    } catch {
      setFormats([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOnly]);

  return { formats, loading, reload };
}

/** Map id → format, pratique pour l'affichage en table. */
export function indexFormats(list: PackagingFormat[]) {
  const m: Record<string, PackagingFormat> = {};
  list.forEach((f) => (m[f.id] = f));
  return m;
}
