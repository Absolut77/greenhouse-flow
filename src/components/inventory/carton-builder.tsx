import { Boxes, Copy, Package, Plus, Trash2 } from "lucide-react";

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
import { CONTAINER_TYPES, fmtG } from "@/lib/containers";

export type BagDraft = {
  code: string;
  type: string;
  copies: string;
  units: string;
  unitWeight: string;
  gross: string;
};

export type CartonDraft = {
  code: string;
  location: string;
  bags: BagDraft[];
};

export const emptyBag = (i: number, type = "bulk"): BagDraft => ({
  code: `SAC-${String(i).padStart(2, "0")}`,
  type,
  copies: "1",
  units: "1",
  unitWeight: "",
  gross: "",
});

export const emptyCarton = (i: number, type = "bulk"): CartonDraft => ({
  code: `CARTON-${i}`,
  location: "",
  bags: [emptyBag(1, type)],
});

const num = (v: string) => Number(v) || 0;

export function bagNet(b: BagDraft) {
  return num(b.units) * num(b.unitWeight);
}

export function cartonTotals(cartons: CartonDraft[]) {
  let bags = 0;
  let units = 0;
  let grams = 0;
  for (const c of cartons) {
    for (const b of c.bags) {
      const copies = Math.max(num(b.copies), 0);
      bags += copies;
      units += copies * num(b.units);
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
    }[] = [];
    let seq = 1;
    for (const b of c.bags) {
      const copies = Math.max(Math.round(num(b.copies)), 0);
      for (let i = 0; i < copies; i++) {
        const suffix = copies > 1 ? `-${String(i + 1).padStart(2, "0")}` : "";
        bags.push({
          container_code: `${c.code}/${b.code || `SAC-${seq}`}${suffix}`,
          container_type: b.type,
          unit_count: Math.round(num(b.units)),
          unit_weight_grams: num(b.unitWeight),
          net_weight_grams: bagNet(b),
          gross_weight_grams: b.gross.trim() ? num(b.gross) : null,
          location: c.location.trim() || null,
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

  const totals = cartonTotals(cartons);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Boxes className="h-4 w-4" /> Cartons &amp; sacs reçus
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...cartons, emptyCarton(cartons.length + 1, defaultType)])}
        >
          <Plus className="mr-1 h-4 w-4" /> Ajouter un carton
        </Button>
      </div>

      {cartons.length === 0 && (
        <p className="text-sm italic text-muted-foreground">
          Aucun carton : la réception sera enregistrée en un seul sac global.
        </p>
      )}

      {cartons.map((c, ci) => {
        const t = cartonTotals([c]);
        return (
          <div key={ci} className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="grid gap-1.5">
                <Label className="text-xs">Identifiant du carton</Label>
                <Input
                  value={c.code}
                  onChange={(e) => patchCarton(ci, { code: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Emplacement</Label>
                <Input
                  value={c.location}
                  onChange={(e) => patchCarton(ci, { location: e.target.value })}
                  placeholder="Vault A..."
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => onChange(cartons.filter((_, i) => i !== ci))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            <div className="space-y-2">
              {c.bags.map((b, bi) => (
                <div
                  key={bi}
                  className="grid gap-2 rounded-md border border-border/40 bg-background/40 p-2 sm:grid-cols-[1.2fr_1fr_0.7fr_0.8fr_0.9fr_0.9fr_auto] sm:items-end"
                >
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Sac</Label>
                    <Input value={b.code} onChange={(e) => patchBag(ci, bi, { code: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Type</Label>
                    <Select value={b.type} onValueChange={(v) => patchBag(ci, bi, { type: v })}>
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
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Nb sacs</Label>
                    <Input
                      type="number"
                      min="1"
                      value={b.copies}
                      onChange={(e) => patchBag(ci, bi, { copies: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Unités / sac</Label>
                    <Input
                      type="number"
                      min="0"
                      value={b.units}
                      onChange={(e) => patchBag(ci, bi, { units: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Poids / unité (g)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={b.unitWeight}
                      onChange={(e) => patchBag(ci, bi, { unitWeight: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
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
                            { ...b, code: `${b.code}-B` },
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
                      onClick={() => patchCarton(ci, { bags: c.bags.filter((_, j) => j !== bi) })}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  patchCarton(ci, { bags: [...c.bags, emptyBag(c.bags.length + 1, defaultType)] })
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Ligne de sacs
              </Button>
            </div>

            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              {t.bags} sac{t.bags > 1 ? "s" : ""} · {t.units} unités · {fmtG(t.grams)} g
            </div>
          </div>
        );
      })}

      {cartons.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3 text-sm">
          <span className="text-muted-foreground">Total réception</span>
          <span className="font-semibold tabular-nums">
            {totals.bags} sacs · {totals.units} unités · {fmtG(totals.grams)} g
          </span>
        </div>
      )}
    </div>
  );
}
