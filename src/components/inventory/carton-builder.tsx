import { useState } from "react";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Copy,
  Package,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CartonQuickEntry } from "@/components/inventory/carton-quick-entry";
import { CONTAINER_TYPES, fmtG, isBulkContainerType } from "@/lib/containers";
import {
  formatNetGrams,
  formatsForContainerType,
  usePackagingFormats,
  type PackagingFormat,
} from "@/lib/packaging-formats";

export const NO_FORMAT = "__no_format__";
const NO_SIZE = "__no_size__";

/** Tailles de fleur (miroir de FLOWER_SIZES côté inventaire). */
const FLOWER_SIZES = [
  { value: "trim", label: "Trim" },
  { value: "medium", label: "Medium" },
  { value: "small", label: "Small" },
  { value: "hand_trim", label: "Hand Trim" },
  { value: "mix", label: "Mix" },
];

/** Types saisis en poids simple (pas d'unités multiples). */
const SIMPLE_TYPES = ["bulk", "trim", "sample", "lab_sample", "retention", "other"];
/** Types où la taille de fleur est pertinente. */
const FLOWER_TYPES = ["bulk", "trim"];

export const isSimpleType = (t: string) => SIMPLE_TYPES.includes(t);


/** A, B, ... Z, AA, AB... */
export const cartonLetter = (i: number) => {
  let n = Math.max(i, 1);
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export type BagDraft = {
  /** Id du contenant existant (édition). Absent = nouveau sac. */
  id?: string | null;
  code: string;
  type: string;
  copies: string;
  units: string;
  unitWeight: string;
  /** Poids net saisi directement (types simples). */
  weight: string;
  gross: string;
  formatId: string;
  flowerSize: string;
  /** Notes existantes conservées si aucune taille n'est choisie. */
  notes?: string | null;
};

export type CartonDraft = {
  /** Id du carton existant (édition). Absent = nouveau carton. */
  id?: string | null;
  /** true pour le groupe "sans carton" (contenants orphelins). */
  noCarton?: boolean;
  code: string;
  location: string;
  bags: BagDraft[];
};


export const defaultWeightForType = (type: string) => (type === "bulk" ? "1000" : "");

export const emptyBag = (i: number, type = "bulk"): BagDraft => ({
  code: String(i),
  type,
  copies: "1",
  units: "1",
  unitWeight: "",
  weight: defaultWeightForType(type),
  gross: "",
  formatId: NO_FORMAT,
  flowerSize: NO_SIZE,
});

export const emptyCarton = (i: number, type = "bulk"): CartonDraft => ({
  code: cartonLetter(i),
  location: "",
  bags: [emptyBag(1, type)],
});

const num = (v: string) => Number(v) || 0;

export function bagNet(b: BagDraft) {
  return isSimpleType(b.type) ? num(b.weight) : num(b.units) * num(b.unitWeight);
}

const bagUnits = (b: BagDraft) => (isSimpleType(b.type) ? 1 : Math.round(num(b.units)));
const bagCopies = (b: BagDraft) => (isSimpleType(b.type) ? 1 : Math.max(num(b.copies), 0));

export function cartonTotals(cartons: CartonDraft[]) {
  let bags = 0;
  let units = 0;
  let grams = 0;
  for (const c of cartons) {
    for (const b of c.bags) {
      const copies = bagCopies(b);
      bags += copies;
      units += copies * bagUnits(b);
      grams += copies * bagNet(b);
    }
  }
  return { bags, units, grams };
}

/** Expands the drafts into concrete (carton, bag) rows ready to insert. */
export function expandCartons(cartons: CartonDraft[]) {
  return cartons.map((c) => {
    const bags: {
      container_code: string;
      container_type: string;
      unit_count: number;
      unit_weight_grams: number;
      net_weight_grams: number;
      gross_weight_grams: number | null;
      location: string | null;
      format_id: string | null;
      notes: string | null;
    }[] = [];
    let seq = 1;
    for (const b of c.bags) {
      const copies = Math.max(Math.round(bagCopies(b)), 0);
      const net = bagNet(b);
      const units = bagUnits(b);
      const sizeLabel =
        b.flowerSize && b.flowerSize !== NO_SIZE
          ? (FLOWER_SIZES.find((s) => s.value === b.flowerSize)?.label ?? b.flowerSize)
          : null;
      for (let i = 0; i < copies; i++) {
        const suffix = copies > 1 ? `-${i + 1}` : "";
        bags.push({
          container_code: `${c.code}/${b.code || seq}${suffix}`,
          container_type: b.type,
          unit_count: units,
          unit_weight_grams: units > 0 ? net / units : net,
          net_weight_grams: net,
          gross_weight_grams: b.gross.trim() ? num(b.gross) : null,
          location: c.location.trim() || null,
          format_id: b.formatId && b.formatId !== NO_FORMAT ? b.formatId : null,
          notes: sizeLabel ? `Taille : ${sizeLabel}` : null,
        });
        seq++;
      }
    }
    return { carton: c, bags };
  });
}

/** Libellé de taille de fleur (ou null). */
export const flowerSizeLabel = (v: string | null | undefined) =>
  v && v !== NO_SIZE ? (FLOWER_SIZES.find((s) => s.value === v)?.label ?? v) : null;

/** Retrouve la valeur de taille depuis une note "Taille : X". */
export const flowerSizeFromNotes = (notes: string | null | undefined) => {
  const m = notes?.match(/Taille\s*:\s*(.+)/i);
  if (!m) return NO_SIZE;
  const label = m[1].trim().toLowerCase();
  return FLOWER_SIZES.find((s) => s.label.toLowerCase() === label)?.value ?? NO_SIZE;
};

export type ExpandedBag = {
  id: string | null;
  container_code: string;
  container_type: string;
  unit_count: number;
  unit_weight_grams: number;
  net_weight_grams: number;
  gross_weight_grams: number | null;
  location: string | null;
  format_id: string | null;
  notes: string | null;
};

/**
 * Variante « édition » : conserve les ids existants et n'ajoute pas de préfixe
 * carton pour le groupe « sans carton ».
 */
export function expandCartonsForEdit(cartons: CartonDraft[]) {
  return cartons.map((c) => {
    const bags: ExpandedBag[] = [];
    let seq = 1;
    for (const b of c.bags) {
      const copies = Math.max(Math.round(bagCopies(b)), 0);
      const net = bagNet(b);
      const units = bagUnits(b);
      const sizeLabel = flowerSizeLabel(b.flowerSize);
      for (let i = 0; i < copies; i++) {
        const suffix = copies > 1 ? `-${i + 1}` : "";
        const base = `${b.code || seq}${suffix}`;
        bags.push({
          id: i === 0 ? (b.id ?? null) : null,
          container_code: c.noCarton || !c.code.trim() ? base : `${c.code}/${base}`,
          container_type: b.type,
          unit_count: units,
          unit_weight_grams: units > 0 ? net / units : net,
          net_weight_grams: net,
          gross_weight_grams: b.gross.trim() ? num(b.gross) : null,
          location: c.location.trim() || null,
          format_id: b.formatId && b.formatId !== NO_FORMAT ? b.formatId : null,
          notes: sizeLabel ? `Taille : ${sizeLabel}` : (b.notes ?? null),
        });
        seq++;
      }
    }
    return { carton: c, bags };
  });
}



export function CartonBuilder({
  cartons,
  onChange,
  defaultType = "bulk",
}: {
  cartons: CartonDraft[];
  onChange: (next: CartonDraft[]) => void;
  defaultType?: string;
}) {
  const patchCarton = (ci: number, patch: Partial<CartonDraft>) =>
    onChange(cartons.map((c, i) => (i === ci ? { ...c, ...patch } : c)));

  const patchBag = (ci: number, bi: number, patch: Partial<BagDraft>) =>
    onChange(
      cartons.map((c, i) =>
        i === ci
          ? { ...c, bags: c.bags.map((b, j) => (j === bi ? { ...b, ...patch } : b)) }
          : c,
      ),
    );

  const { formats } = usePackagingFormats();

  const applyFormat = (ci: number, bi: number, formatId: string) => {
    if (formatId === NO_FORMAT) return patchBag(ci, bi, { formatId });
    const f = formats.find((x: PackagingFormat) => x.id === formatId);
    if (!f) return patchBag(ci, bi, { formatId });
    patchBag(ci, bi, {
      formatId,
      units: String(f.units_per_pack),
      unitWeight: String(Number(f.unit_weight_grams)),
    });
  };

  const totals = cartonTotals(cartons);

  // Cartons repliés par défaut (saisie intensive : jusqu'à A → L).
  const [open, setOpen] = useState<number[]>([]);
  const isOpen = (i: number) => open.includes(i);
  const toggle = (i: number) =>
    setOpen((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]));

  const addCarton = () => {
    onChange([...cartons, emptyCarton(cartons.length + 1, defaultType)]);
    setOpen((o) => [...o, cartons.length]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Boxes className="h-4 w-4" /> Cartons &amp; sacs
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setOpen([])}
          >
            Tout réduire
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setOpen(cartons.map((_, i) => i))}
          >
            Tout ouvrir
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7" onClick={addCarton}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter un carton
          </Button>
        </div>
      </div>

      <CartonQuickEntry
        existingCount={cartons.length}
        onApply={(generated, mode) => {
          const next = mode === "replace" ? generated : [...cartons, ...generated];
          onChange(next);
          setOpen(
            mode === "replace"
              ? generated.map((_, i) => i)
              : generated.map((_, i) => cartons.length + i),
          );
        }}
      />


      {cartons.length === 0 && (
        <p className="text-sm italic text-muted-foreground">
          Aucun carton : la saisie sera enregistrée en un seul sac global.
        </p>
      )}

      {cartons.map((c, ci) => {
        const t = cartonTotals([c]);
        const opened = isOpen(ci);
        return (
          <div key={ci} className="rounded-md border border-border/60 bg-muted/20">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <button
                type="button"
                onClick={() => toggle(ci)}
                className="flex flex-1 items-center gap-2 text-left text-sm"
              >
                {opened ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="font-semibold">Carton {c.code || "—"}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t.bags} sac{t.bags > 1 ? "s" : ""} · {fmtG(t.grams)} g
                </span>
                {c.location.trim() && (
                  <span className="truncate text-xs text-muted-foreground">· {c.location}</span>
                )}
              </button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => {
                  onChange(cartons.filter((_, i) => i !== ci));
                  setOpen([]);
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>

            {opened && (
            <div className="space-y-2 border-t border-border/60 p-2">
            <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
              <div className="grid gap-1.5">
                <Label className="text-xs">Carton</Label>
                <Input
                  value={c.code}
                  onChange={(e) => patchCarton(ci, { code: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Emplacement</Label>
                <Input
                  value={c.location}
                  onChange={(e) => patchCarton(ci, { location: e.target.value })}
                  placeholder="Voute - 155..."
                />
              </div>
            </div>

            <div className="space-y-2">
              {c.bags.map((b, bi) => {
                const simple = isSimpleType(b.type);
                const withSize = FLOWER_TYPES.includes(b.type);
                return (
                  <div
                    key={bi}
                    className="flex flex-wrap items-end gap-2 rounded-md border border-border/40 bg-background/40 p-1.5"
                  >
                    <div className="grid w-16 gap-1.5">
                      <Label className="text-xs">Sac</Label>
                      <Input
                        value={b.code}
                        onChange={(e) => patchBag(ci, bi, { code: e.target.value })}
                      />
                    </div>
                    <div className="grid w-40 gap-1.5">
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={b.type}
                        onValueChange={(v) =>
                          patchBag(ci, bi, {
                            type: v,
                            weight: v === "bulk" && !b.weight.trim() ? "1000" : b.weight,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONTAINER_TYPES.map((t2) => (
                            <SelectItem key={t2.value} value={t2.value}>
                              {t2.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {withSize && (
                      <div className="grid w-36 gap-1.5">
                        <Label className="text-xs">Type / taille de fleur</Label>
                        <Select
                          value={b.flowerSize || NO_SIZE}
                          onValueChange={(v) => patchBag(ci, bi, { flowerSize: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_SIZE}>—</SelectItem>
                            {FLOWER_SIZES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {simple ? (
                      <div className="grid w-28 gap-1.5">
                        <Label className="text-xs">Poids (g)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={b.weight}
                          onChange={(e) => patchBag(ci, bi, { weight: e.target.value })}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="grid w-44 gap-1.5">
                          <Label className="text-xs">Format</Label>
                          <Select
                            value={b.formatId || NO_FORMAT}
                            onValueChange={(v) => applyFormat(ci, bi, v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Format" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_FORMAT}>Aucun / Bulk</SelectItem>
                              {formats.map((f) => (
                                <SelectItem key={f.id} value={f.id}>
                                  {f.name} ({formatNetGrams(f)} g)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid w-20 gap-1.5">
                          <Label className="text-xs">Nb sacs</Label>
                          <Input
                            type="number"
                            min="1"
                            value={b.copies}
                            onChange={(e) => patchBag(ci, bi, { copies: e.target.value })}
                          />
                        </div>
                        <div className="grid w-24 gap-1.5">
                          <Label className="text-xs">Unités / sac</Label>
                          <Input
                            type="number"
                            min="0"
                            value={b.units}
                            onChange={(e) => patchBag(ci, bi, { units: e.target.value })}
                          />
                        </div>
                        <div className="grid w-28 gap-1.5">
                          <Label className="text-xs">Poids / unité (g)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={b.unitWeight}
                            onChange={(e) => patchBag(ci, bi, { unitWeight: e.target.value })}
                          />
                        </div>
                      </>
                    )}

                    <div className="grid w-24 gap-1.5">
                      <Label className="text-xs">Net / sac (g)</Label>
                      <div className="flex h-9 items-center rounded-md border border-border/60 bg-muted/40 px-2 text-sm tabular-nums">
                        {fmtG(bagNet(b))}
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Dupliquer la ligne"
                        onClick={() =>
                          patchCarton(ci, {
                            bags: [
                              ...c.bags.slice(0, bi + 1),
                              { ...b, code: String(c.bags.length + 1) },
                              ...c.bags.slice(bi + 1),
                            ],
                          })
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={c.bags.length === 1}
                        onClick={() =>
                          patchCarton(ci, { bags: c.bags.filter((_, j) => j !== bi) })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  patchCarton(ci, { bags: [...c.bags, emptyBag(c.bags.length + 1, defaultType)] })
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter un sac
              </Button>
            </div>

            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              {t.bags} sac{t.bags > 1 ? "s" : ""} · {t.units} unités · {fmtG(t.grams)} g
            </div>
            </div>
            )}
          </div>
        );
      })}

      {cartons.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums">
            {totals.bags} sacs · {totals.units} unités · {fmtG(totals.grams)} g
          </span>
        </div>
      )}
    </div>
  );
}
