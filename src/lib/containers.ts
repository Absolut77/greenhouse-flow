import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type StockContainer = Tables<"stock_containers">;
export type StockCarton = Tables<"stock_cartons">;

export const CONTAINER_TYPES = [
  { value: "bulk", label: "Bulk" },
  { value: "sample", label: "Sample" },
  { value: "lab_sample", label: "Laboratory Sample" },
  { value: "master_case", label: "Master Case" },
  { value: "preroll", label: "Pre-roll" },
  { value: "packaged", label: "Packagé" },
  { value: "retention", label: "Rétention" },
  { value: "other", label: "Autre" },
] as const;

/** Libellés historiques (types retirés du sélecteur mais présents en base). */
const LEGACY_TYPE_LABELS: Record<string, string> = { trim: "Trim" };

export const CONTAINER_TYPE_CLASS: Record<string, string> = {
  bulk: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  packaged: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  preroll: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  trim: "bg-lime-500/15 text-lime-400 border-lime-500/30",
  sample: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  lab_sample: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  master_case: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  retention: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  other: "bg-muted text-muted-foreground",
};


export const CONTAINER_STATUSES = [
  { value: "available", label: "Disponible" },
  { value: "reserved", label: "Réservé" },
  { value: "shipped", label: "Expédié / vidé" },
  { value: "destroyed", label: "Détruit" },
] as const;

export const CONTAINER_STATUS_CLASS: Record<string, string> = {
  available: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  reserved: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  shipped: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  destroyed: "bg-red-500/15 text-red-400 border-red-500/30",
};

export const containerTypeLabel = (v: string | null | undefined) =>
  CONTAINER_TYPES.find((t) => t.value === v)?.label ?? v ?? "—";

export const containerStatusLabel = (v: string | null | undefined) =>
  CONTAINER_STATUSES.find((t) => t.value === v)?.label ?? v ?? "—";

/** Retention containers are locked: they can never leave inventory. */
export const isBlockedContainer = (c: Pick<StockContainer, "container_type">) =>
  c.container_type === "retention";

export const isUsableContainer = (c: StockContainer) =>
  c.status === "available" &&
  !isBlockedContainer(c) &&
  Number(c.net_weight_grams ?? 0) > 0;

export async function fetchContainersForLots(lotIds: string[]) {
  if (lotIds.length === 0) return [] as StockContainer[];
  const { data, error } = await supabase
    .from("stock_containers")
    .select("*")
    .in("lot_id", lotIds)
    .order("container_code", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type ContainerSummary = {
  total: number;
  available: number;
  availableUnits: number;
  availableGrams: number;
  byType: Record<string, { available: number; grams: number; units: number }>;
};

export function summarizeContainers(list: StockContainer[]): ContainerSummary {
  const s: ContainerSummary = {
    total: list.length,
    available: 0,
    availableUnits: 0,
    availableGrams: 0,
    byType: {},
  };
  for (const c of list) {
    if (c.status !== "available") continue;
    const g = Number(c.net_weight_grams ?? 0);
    const u = Number(c.unit_count ?? 0);
    s.available += 1;
    s.availableUnits += u;
    s.availableGrams += g;
    const t = c.container_type ?? "other";
    s.byType[t] ??= { available: 0, grams: 0, units: 0 };
    s.byType[t].available += 1;
    s.byType[t].grams += g;
    s.byType[t].units += u;
  }
  return s;
}

export const fmtG = (n: number) =>
  Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, "") : "0";
