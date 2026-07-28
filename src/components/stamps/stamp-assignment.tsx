import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Stamp } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchAvailableReels, type ReelWithBalance } from "@/lib/stamps";

export const NO_REEL = "__no_reel__";

export type StampSelection = {
  enabled: boolean;
  reelId: string;
  quantity: string;
};

export const emptyStampSelection = (): StampSelection => ({
  enabled: false,
  reelId: NO_REEL,
  quantity: "",
});

/** Valide la sélection ; retourne un message d'erreur ou null. */
export function validateStampSelection(
  sel: StampSelection,
  reels: ReelWithBalance[],
): string | null {
  if (!sel.enabled) return null;
  if (sel.reelId === NO_REEL) return "Sélectionnez un rouleau de timbres.";
  const q = Math.round(Number(sel.quantity));
  if (!Number.isFinite(q) || q <= 0) return "Nombre de timbres invalide.";
  const reel = reels.find((r) => r.id === sel.reelId);
  if (!reel) return "Rouleau introuvable.";
  if (q > reel.balance)
    return `Le rouleau ${reel.serial_number} n'a que ${reel.balance} timbre(s) disponible(s) (demandé : ${q}).`;
  return null;
}

/**
 * Sélecteur de rouleau + nombre de timbres à apposer sur un lot Mastercase.
 * 1 unité packagée = 1 timbre.
 */
export function StampAssignment({
  value,
  onChange,
  suggestedUnits,
  reels,
  loading,
  alreadyApplied,
  title = "Timbres d'accise",
}: {
  value: StampSelection;
  onChange: (next: StampSelection) => void;
  suggestedUnits: number;
  reels: ReelWithBalance[];
  loading?: boolean;
  alreadyApplied?: number;
  title?: string;
}) {
  const selected = reels.find((r) => r.id === value.reelId) ?? null;
  const q = Math.round(Number(value.quantity) || 0);
  const overflow = selected != null && q > selected.balance;

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Stamp className="h-4 w-4" /> {title}
          </p>
          <p className="text-xs text-muted-foreground">
            1 unité packagée = 1 timbre. Le rouleau est débité à l'enregistrement.
            {alreadyApplied != null && alreadyApplied > 0 && (
              <> Déjà apposés sur ce lot : <strong>{alreadyApplied}</strong>.</>
            )}
          </p>
        </div>
        <Switch
          checked={value.enabled}
          onCheckedChange={(enabled) =>
            onChange({
              ...value,
              enabled,
              quantity:
                enabled && !value.quantity ? String(suggestedUnits || "") : value.quantity,
            })
          }
        />
      </div>

      {value.enabled && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Rouleau *</Label>
            <Select
              value={value.reelId}
              onValueChange={(reelId) => onChange({ ...value, reelId })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisir un rouleau" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_REEL}>—</SelectItem>
                {reels.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.serial_number} — {r.province ?? "?"} · {r.balance} dispo
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loading && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Chargement des rouleaux...
              </p>
            )}
            {!loading && reels.length === 0 && (
              <p className="text-xs text-amber-400">
                Aucun rouleau disponible (tous épuisés).
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label>Nombre de timbres *</Label>
            <Input
              type="number"
              min="1"
              value={value.quantity}
              onChange={(e) => onChange({ ...value, quantity: e.target.value })}
              placeholder={String(suggestedUnits || "")}
            />
            <p className="text-xs text-muted-foreground">
              Suggéré (unités du lot) : <strong>{suggestedUnits}</strong>
            </p>
            {overflow && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3" />
                Balance insuffisante : {selected?.balance} disponible(s).
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Charge les rouleaux disponibles (balance > 0). */
export function useAvailableReels() {
  const [reels, setReels] = useState<ReelWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      setReels(await fetchAvailableReels());
    } catch {
      setReels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  return { reels, loading, reload };
}
