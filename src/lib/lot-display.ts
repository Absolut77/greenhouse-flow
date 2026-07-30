import type { Tables } from "@/integrations/supabase/types";

type Lot = Pick<Tables<"inventory_lots">, "id" | "lot_number" | "lot_kind" | "product_type" | "batch_id">;
type Batch = Pick<Tables<"batches">, "id" | "batch_number">;

/**
 * Modèle métier : le stock de base d'une batch est porté par des sacs
 * (`stock_containers`). Les lots `bulk` et `retention` ne sont que des
 * porteurs techniques côté DB (triggers stock / timbres / audit) et ne
 * doivent JAMAIS apparaître comme des « lots » dans l'UI.
 */
export const TECHNICAL_LOT_KINDS = ["bulk", "retention"];

export const isTechnicalLot = (lot: { lot_kind?: string | null } | null | undefined) =>
  TECHNICAL_LOT_KINDS.includes(lot?.lot_kind ?? "bulk");

/** Un sous-lot = résultat d'une transformation (pré-roulés, mastercase, retour…). */
export const isSubLot = (lot: { lot_kind?: string | null } | null | undefined) =>
  !isTechnicalLot(lot);

/**
 * Libellé affiché pour un lot :
 * - lot technique → « Batch 130 — stock bulk »
 * - sous-lot      → son numéro réel
 */
export function lotDisplayLabel(
  lot: Lot | null | undefined,
  batch?: Batch | null,
): string {
  if (!lot) return "—";
  if (!isTechnicalLot(lot)) return lot.lot_number;
  const b = batch?.batch_number;
  return b ? `${b} — stock bulk` : (lot.lot_number ?? "Stock bulk");
}
