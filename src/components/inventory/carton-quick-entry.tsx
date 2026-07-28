import { useMemo, useState } from "react";
import { AlertTriangle, Sparkles, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cartonTotals, type CartonDraft } from "@/components/inventory/carton-builder";
import { parseCartonFormula } from "@/lib/carton-formula";
import { fmtG } from "@/lib/containers";

const PLACEHOLDER = `A: 7x1000 Bulk Big, 1x726 Bulk HT
B: 12x1000 Bulk Medium
C: 10x7g Mastercase, 2x3.5g Mastercase
D: 5x5x0.5 Pre-roll`;

export function CartonQuickEntry({
  existingCount,
  onApply,
}: {
  existingCount: number;
  onApply: (cartons: CartonDraft[], mode: "append" | "replace") => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [confirmReplace, setConfirmReplace] = useState(false);

  const result = useMemo(
    () => (text.trim() ? parseCartonFormula(text, existingCount) : null),
    [text, existingCount],
  );
  const totals = result ? cartonTotals(result.cartons) : null;

  const apply = (mode: "append" | "replace") => {
    if (!result || result.cartons.length === 0) return;
    onApply(result.cartons, mode);
    setText("");
    setConfirmReplace(false);
    setOpen(false);
  };

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <Wand2 className="mr-1 h-3.5 w-3.5" /> Saisie rapide
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-md border border-dashed border-border/70 bg-muted/20 p-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5" /> Saisie rapide par formule
        </Label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => setOpen(false)}
        >
          Fermer
        </Button>
      </div>

      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setConfirmReplace(false);
        }}
        rows={4}
        spellCheck={false}
        placeholder={PLACEHOLDER}
        className="font-mono text-xs"
      />

      <p className="text-[11px] leading-snug text-muted-foreground">
        Une ligne = un carton. <code>NxPOIDS [type] [taille]</code>, séparés par des
        virgules. Type par défaut : Bulk. Pre-roll / packagé : <code>5x5x0.5</code> ou{" "}
        <code>10x7g</code>.
      </p>

      {result && result.errors.length > 0 && (
        <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {result.errors.map((e, i) => (
            <div key={i} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Ligne {e.line} : {e.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {result && result.cartons.length > 0 && totals && (
        <div className="space-y-2 rounded-md border bg-background/60 p-2 text-xs">
          <div className="font-medium">
            Aperçu : {result.cartons.length} carton
            {result.cartons.length > 1 ? "s" : ""} · {totals.bags} sac
            {totals.bags > 1 ? "s" : ""} · {totals.units} unités ·{" "}
            <span className="tabular-nums">{fmtG(totals.grams)} g</span>
          </div>
          <ul className="space-y-0.5 text-muted-foreground">
            {result.cartons.map((c, i) => {
              const t = cartonTotals([c]);
              return (
                <li key={i} className="tabular-nums">
                  Carton {c.code} — {t.bags} sac{t.bags > 1 ? "s" : ""} · {fmtG(t.grams)} g
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="button" size="sm" className="h-7" onClick={() => apply("append")}>
              Générer ({existingCount > 0 ? "ajouter" : "créer"})
            </Button>
            {existingCount > 0 &&
              (confirmReplace ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="h-7"
                  onClick={() => apply("replace")}
                >
                  Confirmer le remplacement des {existingCount} carton
                  {existingCount > 1 ? "s" : ""}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => setConfirmReplace(true)}
                >
                  Remplacer la saisie existante
                </Button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
