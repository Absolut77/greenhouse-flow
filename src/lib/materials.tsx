import { Badge } from "@/components/ui/badge";

/**
 * Matière d'un lot : Fleur ou Trim.
 * Source : `product_type` ("flower" / "trim" / "preroll" ...), sinon `flower_size`
 * ("trim" => Trim). Les lots bulk sans taille renseignée restent indéterminés.
 */
export type Material = "flower" | "trim";

type LotLike = {
  product_type?: string | null;
  flower_size?: string | null;
  lot_kind?: string | null;
};

export function materialOf(lot: LotLike | null | undefined): Material | null {
  if (!lot) return null;
  const pt = lot.product_type ?? null;
  if (pt === "trim") return "trim";
  if (pt === "flower" || pt === "preroll" || pt === "packaged") return "flower";
  const size = lot.flower_size ?? null;
  if (size === "trim") return "trim";
  if (size) return "flower";
  return null;
}

export const MATERIAL_LABEL: Record<Material, string> = {
  flower: "Fleur",
  trim: "Trim",
};

const MATERIAL_CLASS: Record<Material, string> = {
  flower: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  trim: "bg-lime-500/15 text-lime-300 border-lime-500/40",
};

export const materialLabel = (m: Material | null) => (m ? MATERIAL_LABEL[m] : "—");

export function MaterialBadge({ lot }: { lot: LotLike | null | undefined }) {
  const m = materialOf(lot);
  if (!m) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={MATERIAL_CLASS[m]}>
      {MATERIAL_LABEL[m]}
    </Badge>
  );
}

/** Totaux séparés Fleur / Trim (jamais fusionnés). */
export function materialTotals(
  lots: (LotLike & { quantity_grams?: number | string | null; status?: string | null })[],
) {
  let flower = 0;
  let trim = 0;
  let unknown = 0;
  for (const l of lots) {
    if (l.status && l.status !== "available") continue;
    const g = Number(l.quantity_grams ?? 0);
    const m = materialOf(l);
    if (m === "flower") flower += g;
    else if (m === "trim") trim += g;
    else unknown += g;
  }
  return { flower, trim, unknown };
}

/** Variété affichable : champ du lot, sinon variété de la batch liée. */
export function strainOf(
  lot: { strain?: string | null; notes?: string | null } | null | undefined,
  batch?: { strain?: string | null } | null,
) {
  const own = (lot as { strain?: string | null } | null)?.strain?.trim();
  if (own) return own;
  const fromNotes = lot?.notes?.match(/Variété\s*:\s*([^—]+)/)?.[1]?.trim();
  if (fromNotes) return fromNotes;
  return batch?.strain?.trim() || null;
}
