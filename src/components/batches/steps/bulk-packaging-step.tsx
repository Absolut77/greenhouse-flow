import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Pencil, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  formatNetGrams,
  indexFormats,
  usePackagingFormats,
} from "@/lib/packaging-formats";

const NO_FORMAT = "__no_format__";

export type PackagingBag = {
  id: string;
  batch_id: string;
  stage_id: string | null;
  flower_type: string;
  bag_type: string;
  bag_count: number;
  net_weight_grams: number;
  gross_weight_grams: number | null;
  location: string | null;
  notes: string | null;
  inventory_lot_id: string | null;
  format_id: string | null;
  created_at: string;
};

const FLOWER_TYPES = [
  "Flower Big",
  "Flower Medium",
  "Flower Small",
  "Hand Trim",
  "Trim",
  "Échantillon",
  "Rétention",
];

export function BulkPackagingStepContent({
  batchId,
  stageId,
  disabled,
  availableGrams,
  onChanged,
}: {
  batchId: string;
  stageId: string | null;
  disabled: boolean;
  availableGrams: number | null;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<PackagingBag[] | null>(null);
  const { formats } = usePackagingFormats();
  const formatMap = indexFormats(formats);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PackagingBag | null>(null);

  const load = async () => {
    const { data, error } = await (supabase as any)
      .from("packaging_bags")
      .select("*")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as PackagingBag[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const remove = async (b: PackagingBag) => {
    if (b.inventory_lot_id) return toast.error("Sac déjà lié à l'inventaire — impossible de supprimer.");
    if (!confirm("Supprimer cette ligne de sac ?")) return;
    const { error } = await (supabase as any).from("packaging_bags").delete().eq("id", b.id);
    if (error) return toast.error(error.message);
    load();
    onChanged?.();
  };

  const totalPackaged = (rows ?? []).reduce(
    (s, r) => s + Number(r.net_weight_grams) * Number(r.bag_count),
    0,
  );
  const overLimit = availableGrams != null && totalPackaged > availableGrams + 1e-6;
  const missingLocation = (rows ?? []).some((r) => !r.location || !r.location.trim());

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
        <div className="text-muted-foreground">
          La quantité totale à packager est basée sur les <b>poids de sortie du curing</b> (pas le poids frais).
        </div>
        <div className="text-muted-foreground">
          À la clôture : les sacs <b>Échantillon</b> génèrent un lot <span className="text-sky-400">Sample</span>, les sacs <b>Rétention</b> un lot <span className="text-amber-400">Rétention</span> (bloqué), et le reste un lot <span className="text-emerald-400">Bulk</span>.
        </div>
      </div>


      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Liste des sacs</h4>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => { setEditing(null); setOpen(true); }}
        >
          <Plus className="mr-1 h-4 w-4" /> Ajouter une ligne
        </Button>
      </div>

      {!rows ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          Aucun sac défini. Ajoutez la première ligne.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type de fleur</TableHead>
                <TableHead>Format</TableHead>
                <TableHead className="text-right">Nb</TableHead>
                <TableHead className="text-right">Net / sac (g)</TableHead>
                <TableHead className="text-right">Brut / sac (g)</TableHead>
                <TableHead className="text-right">Total net (g)</TableHead>
                <TableHead>Emplacement</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.flower_type}</TableCell>
                  <TableCell>
                    {r.format_id && formatMap[r.format_id] ? (
                      <Badge variant="outline">{formatMap[r.format_id].name}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Vrac</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{r.bag_count}</TableCell>
                  <TableCell className="text-right">{Number(r.net_weight_grams).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {r.gross_weight_grams != null ? Number(r.gross_weight_grams).toFixed(2) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {(Number(r.net_weight_grams) * Number(r.bag_count)).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {r.location ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <MapPin className="h-3 w-3" /> {r.location}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-500">à définir</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.inventory_lot_id ? (
                      <Badge className="border-transparent bg-emerald-500/20 text-emerald-400">Inventaire</Badge>
                    ) : (
                      <Badge variant="outline">Brouillon</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" disabled={disabled || !!r.inventory_lot_id} onClick={() => { setEditing(r); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" disabled={disabled || !!r.inventory_lot_id} onClick={() => remove(r)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total à packager" value={`${totalPackaged.toFixed(2)} g`} />
        <StatCard
          label="Disponible (sortie curing)"
          value={availableGrams != null ? `${availableGrams.toFixed(2)} g` : "—"}
        />
        <StatCard
          label="Écart"
          value={availableGrams != null ? `${(availableGrams - totalPackaged).toFixed(2)} g` : "—"}
          tone={overLimit ? "err" : undefined}
        />
      </div>

      {overLimit && (
        <p className="text-sm text-destructive">
          Le poids total packagé dépasse le poids disponible (sortie curing).
        </p>
      )}
      {missingLocation && rows && rows.length > 0 && (
        <p className="text-sm text-amber-500">
          Chaque sac doit avoir un emplacement avant de terminer le bulk packaging.
        </p>
      )}

      <BagDialog
        key={editing?.id ?? "new"}
        batchId={batchId}
        stageId={stageId}
        bag={editing}
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}
        onSaved={() => { load(); onChanged?.(); }}
      />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "err" }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${tone === "err" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function BagDialog({
  batchId,
  stageId,
  bag,
  open,
  onOpenChange,
  onSaved,
}: {
  batchId: string;
  stageId: string | null;
  bag: PackagingBag | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [flowerType, setFlowerType] = useState(bag?.flower_type ?? FLOWER_TYPES[0]);
  const [count, setCount] = useState(bag?.bag_count?.toString() ?? "1");
  const [net, setNet] = useState(bag?.net_weight_grams?.toString() ?? "");
  const [gross, setGross] = useState(bag?.gross_weight_grams?.toString() ?? "");
  const [location, setLocation] = useState(bag?.location ?? "");
  const [formatId, setFormatId] = useState(bag?.format_id ?? NO_FORMAT);
  const { formats } = usePackagingFormats();
  const [saving, setSaving] = useState(false);

  /** Sélection d'un format : pré-remplit le net par sac (calcul dynamique). */
  const applyFormat = (v: string) => {
    setFormatId(v);
    const f = formats.find((x) => x.id === v);
    if (f) setNet(String(formatNetGrams(f)));
  };

  const submit = async () => {
    const c = Number(count);
    const n = Number(net);
    if (!c || c <= 0) return toast.error("Nombre de sacs > 0");
    if (!n || n <= 0) return toast.error("Poids net > 0 obligatoire");
    setSaving(true);
    const payload: any = {
      flower_type: flowerType,
      bag_type: "bulk",
      bag_count: c,
      net_weight_grams: n,
      gross_weight_grams: gross.trim() === "" ? null : Number(gross),
      location: location.trim() || null,
      format_id: formatId === NO_FORMAT ? null : formatId,
    };
    let error;
    if (bag) {
      ({ error } = await (supabase as any).from("packaging_bags").update(payload).eq("id", bag.id));
    } else {
      const { data: u } = await supabase.auth.getUser();
      ({ error } = await (supabase as any).from("packaging_bags").insert({
        ...payload,
        batch_id: batchId,
        stage_id: stageId,
        created_by: u.user?.id ?? null,
      }));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(bag ? "Ligne mise à jour" : "Ligne ajoutée");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{bag ? "Modifier la ligne" : "Nouvelle ligne de sacs"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Type de fleur *</Label>
            <select
              value={flowerType}
              onChange={(e) => setFlowerType(e.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              {FLOWER_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="grid gap-2">
            <Label>Format de packaging</Label>
            <Select value={formatId} onValueChange={applyFormat}>
              <SelectTrigger>
                <SelectValue placeholder="Aucun / vrac" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_FORMAT}>Aucun / vrac</SelectItem>
                {formats.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name} ({formatNetGrams(f)} g)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Le net par sac est pré-rempli depuis le format et reste modifiable.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Nb sacs *</Label>
              <Input type="number" min="1" value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Net / sac (g) *</Label>
              <Input type="number" step="0.01" min="0" value={net} onChange={(e) => setNet(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Brut / sac (g)</Label>
              <Input type="number" step="0.01" min="0" value={gross} onChange={(e) => setGross(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Emplacement *</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex. Coffre-fort A / Étagère 3" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
