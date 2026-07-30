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

/* ------------------------------------------------------------------ *
 * Classification matière au niveau du SAC / CONTENANT
 * ------------------------------------------------------------------ */

type ContainerLike = {
  container_type?: string | null;
  notes?: string | null;
  flower_size?: string | null;
};

const FLOWER_SIZE_TOKENS = ["hand trim", "hand_trim", "handtrim", "big", "medium", "small", "mix"];

const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().trim();

const sizeMaterial = (raw: string | null | undefined): Material | null => {
  const v = norm(raw);
  if (!v) return null;
  if (FLOWER_SIZE_TOKENS.includes(v)) return "flower";
  if (v === "trim" || v.includes("trim")) return "trim";
  return "flower";
};

/**
 * Matière d'un contenant (sac). Priorité :
 *  1. « Matière : X » dans les notes
 *  2. « Taille : X » dans les notes / `flower_size` (Hand trim/Big/... = Fleur, Trim = Trim)
 *  3. `container_type` (contient "trim" => Trim, "flower"/"fleur" => Fleur)
 *  4. `product_type` du lot porteur
 * La rétention n'est ni fleur ni trim (exclue du stock utilisable).
 */
export function containerMaterial(
  c: ContainerLike | null | undefined,
  lot?: { product_type?: string | null } | null,
): Material | null {
  if (!c) return null;
  const type = norm(c.container_type);
  if (type === "retention") return null;
  const notes = c.notes ?? "";

  const matiere = norm(notes.match(/mati[eè]re\s*:\s*([^·|\n,;]+)/i)?.[1]);
  if (matiere) {
    if (matiere.includes("trim") && !FLOWER_SIZE_TOKENS.includes(matiere)) return "trim";
    if (matiere.includes("fleur") || matiere.includes("flower")) return "flower";
  }

  const taille = norm(notes.match(/taille\s*:\s*([^·|\n,;]+)/i)?.[1]) || norm(c.flower_size);
  const fromSize = sizeMaterial(taille);
  if (fromSize) return fromSize;

  if (type) {
    if (type.includes("trim") && !type.includes("hand")) return "trim";
    if (type.includes("flower") || type.includes("fleur") || type.includes("bud")) return "flower";
  }

  if (/(^|[^a-z])trim([^a-z]|$)/i.test(notes) && !/hand\s*trim/i.test(notes)) return "trim";

  const pt = norm(lot?.product_type);
  if (pt === "trim") return "trim";
  if (pt === "flower" || pt === "preroll" || pt === "packaged") return "flower";
  return null;
}

/** Badge matière à partir d'une valeur déjà calculée. */
export function MaterialTag({ material }: { material: Material | null }) {
  if (!material) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={MATERIAL_CLASS[material]}>
      {MATERIAL_LABEL[material]}
    </Badge>
  );
}

/** Totaux fleur / trim calculés sur les sacs disponibles (rétention exclue). */
export function containerMaterialTotals(
  containers: (ContainerLike & {
    lot_id?: string | null;
    status?: string | null;
    net_weight_grams?: number | string | null;
  })[],
  lotById: Record<string, { product_type?: string | null }> = {},
) {
  const t = { flower: 0, trim: 0, unknown: 0 };
  for (const c of containers) {
    if ((c.status ?? "available") !== "available") continue;
    const m = containerMaterial(c, c.lot_id ? lotById[c.lot_id] : null);
    if (norm(c.container_type) === "retention") continue;
    const g = Number(c.net_weight_grams ?? 0);
    if (m === "flower") t.flower += g;
    else if (m === "trim") t.trim += g;
    else t.unknown += g;
  }
  return t;
}
