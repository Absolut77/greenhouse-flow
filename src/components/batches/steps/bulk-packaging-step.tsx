import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Pencil } from "lucide-react";
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
import { toast } from "sonner";

export type PackagingBag = {
  id: string;
  batch_id: string;
  stage_id: string | null;
  flower_type: string;
  bag_type: "bulk" | "sample";
  bag_count: number;
  net_weight_grams: number;
  gross_weight_grams: number | null;
  notes: string | null;
  inventory_lot_id: string | null;
  created_at: string;
};

const FLOWER_TYPES = ["Hand Trim", "Flower Big", "Flower Medium", "Flower Small", "Trim"];

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
    if (b.inventory_lot_id) {
      return toast.error("Sac déjà lié à l'inventaire — impossible de supprimer.");
    }
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
  const overLimit =
    availableGrams != null && totalPackaged > availableGrams + 1e-6;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Liste des sacs</h4>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
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
                <TableHead>Type de sac</TableHead>
                <TableHead className="text-right">Nb</TableHead>
                <TableHead className="text-right">Net (g)</TableHead>
                <TableHead className="text-right">Brut (g)</TableHead>
                <TableHead className="text-right">Total net (g)</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.flower_type}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-transparent bg-secondary">
                      {r.bag_type === "bulk" ? "Bulk (1 kg)" : "Sample"}
                    </Badge>
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
                    {r.inventory_lot_id ? (
                      <Badge className="border-transparent bg-emerald-500/20 text-emerald-400">
                        Inventaire
                      </Badge>
                    ) : (
                      <Badge variant="outline">Brouillon</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={disabled || !!r.inventory_lot_id}
                        onClick={() => {
                          setEditing(r);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={disabled || !!r.inventory_lot_id}
                        onClick={() => remove(r)}
                      >
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
          label="Disponible"
          value={availableGrams != null ? `${availableGrams.toFixed(2)} g` : "—"}
        />
        <StatCard
          label="Écart"
          value={
            availableGrams != null ? `${(availableGrams - totalPackaged).toFixed(2)} g` : "—"
          }
          tone={overLimit ? "err" : undefined}
        />
      </div>

      {overLimit && (
        <p className="text-sm text-destructive">
          Le poids total packagé dépasse le poids disponible après destructions.
        </p>
      )}

      <BagDialog
        key={editing?.id ?? "new"}
        batchId={batchId}
        stageId={stageId}
        bag={editing}
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        onSaved={() => {
          load();
          onChanged?.();
        }}
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
  const [bagType, setBagType] = useState<"bulk" | "sample">(bag?.bag_type ?? "bulk");
  const [count, setCount] = useState(bag?.bag_count?.toString() ?? "1");
  const [net, setNet] = useState(bag?.net_weight_grams?.toString() ?? (bag?.bag_type === "sample" ? "" : "1000"));
  const [gross, setGross] = useState(bag?.gross_weight_grams?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const c = Number(count);
    const n = Number(net);
    if (!c || c <= 0) return toast.error("Nombre de sacs > 0");
    if (!n || n <= 0) return toast.error("Poids net > 0 obligatoire");
    setSaving(true);
    const payload: any = {
      flower_type: flowerType,
      bag_type: bagType,
      bag_count: c,
      net_weight_grams: n,
      gross_weight_grams: gross.trim() === "" ? null : Number(gross),
    };
    let error;
    if (bag) {
      ({ error } = await (supabase as any)
        .from("packaging_bags")
        .update(payload)
        .eq("id", bag.id));
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
              {FLOWER_TYPES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label>Type de sac *</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={bagType === "bulk" ? "default" : "outline"}
                onClick={() => {
                  setBagType("bulk");
                  if (!net) setNet("1000");
                }}
              >
                Bulk (1 kg)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={bagType === "sample" ? "default" : "outline"}
                onClick={() => setBagType("sample")}
              >
                Sample
              </Button>
            </div>
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
