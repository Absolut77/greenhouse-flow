import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type PackagingFormat = Tables<"packaging_formats">;

export const FORMAT_TYPES = [
  { value: "flower", label: "Fleur" },
  { value: "preroll", label: "Pré-roulé" },
] as const;

export const FORMAT_TYPE_CLASS: Record<string, string> = {
  flower: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  preroll: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
};

export const formatTypeLabel = (v: string | null | undefined) =>
  FORMAT_TYPES.find((t) => t.value === v)?.label ?? v ?? "—";

/** Poids net calculé dynamiquement (jamais figé côté UI). */
export const formatNetGrams = (f: Pick<PackagingFormat, "units_per_pack" | "unit_weight_grams" | "net_weight_grams">) => {
  const computed = Number(f.units_per_pack ?? 0) * Number(f.unit_weight_grams ?? 0);
  return computed > 0 ? computed : Number(f.net_weight_grams ?? 0);
};

export const formatLabel = (f: PackagingFormat | null | undefined) =>
  f ? `${f.name} — ${formatNetGrams(f)} g` : "—";

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
