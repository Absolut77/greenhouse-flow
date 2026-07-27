import { useEffect, useState } from "react";
import { Boxes, Loader2, Package, Pencil, Plus, Trash2, Lock } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  CONTAINER_STATUSES,
  CONTAINER_STATUS_CLASS,
  CONTAINER_TYPES,
  CONTAINER_TYPE_CLASS,
  containerStatusLabel,
  containerTypeLabel,
  fmtG,
  isBlockedContainer,
  summarizeContainers,
  type StockCarton,
  type StockContainer,
} from "@/lib/containers";

export function ContainerTypeBadge({ type }: { type: string | null }) {
  return (
    <Badge variant="outline" className={CONTAINER_TYPE_CLASS[type ?? ""] ?? CONTAINER_TYPE_CLASS.other}>
      {containerTypeLabel(type)}
      {type === "retention" ? " 🔒" : ""}
    </Badge>
  );
}

export function ContainerStatusBadge({ status }: { status: string | null }) {
  return (
    <Badge
      variant="outline"
      className={CONTAINER_STATUS_CLASS[status ?? ""] ?? "bg-muted text-muted-foreground"}
    >
      {containerStatusLabel(status)}
    </Badge>
  );
}

const NO_CARTON = "__no_carton__";

export function ContainersSection({
  lotId,
  defaultType = "bulk",
  onChanged,
}: {
  lotId: string;
  defaultType?: string;
  onChanged?: () => void;
}) {
  const { roles } = useAuth();
  const readOnly = roles.length > 0 && roles.every((r) => r === "viewer");

  const [containers, setContainers] = useState<StockContainer[] | null>(null);
  const [cartons, setCartons] = useState<StockCarton[]>([]);
  const [editing, setEditing] = useState<StockContainer | null>(null);
  const [creating, setCreating] = useState(false);
  const [cartonOpen, setCartonOpen] = useState(false);
  const [toDelete, setToDelete] = useState<StockContainer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    const [{ data: cs }, { data: ks }] = await Promise.all([
      supabase
        .from("stock_containers")
        .select("*")
        .eq("lot_id", lotId)
        .order("container_code", { ascending: true }),
      supabase
        .from("stock_cartons")
        .select("*")
        .eq("lot_id", lotId)
        .order("carton_code", { ascending: true }),
    ]);
    setContainers(cs ?? []);
    setCartons(ks ?? []);
    onChanged?.();
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotId]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("stock_containers").delete().eq("id", toDelete.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Sac supprimé");
    setToDelete(null);
    load();
  };

  if (!containers) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement des contenants...
        </CardContent>
      </Card>
    );
  }

  const summary = summarizeContainers(containers);
  const cartonMap: Record<string, StockCarton> = {};
  cartons.forEach((k) => (cartonMap[k.id] = k));

  // Group by carton (null carton = "hors carton")
  const groups = new Map<string, StockContainer[]>();
  containers.forEach((c) => {
    const key = c.carton_id ?? NO_CARTON;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  });
  cartons.forEach((k) => {
    if (!groups.has(k.id)) groups.set(k.id, []);
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <CardTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5" /> Contenants ({summary.available} sac
            {summary.available > 1 ? "s" : ""} disponible{summary.available > 1 ? "s" : ""})
          </CardTitle>
          <CardDescription>
            {fmtG(summary.availableGrams)} g · {summary.availableUnits} unité
            {summary.availableUnits > 1 ? "s" : ""} disponibles sur {summary.total} contenant
            {summary.total > 1 ? "s" : ""}.
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.byType).map(([t, v]) => (
              <Badge
                key={t}
                variant="outline"
                className={CONTAINER_TYPE_CLASS[t] ?? CONTAINER_TYPE_CLASS.other}
              >
                {containerTypeLabel(t)} : {v.available} sac{v.available > 1 ? "s" : ""} ·{" "}
                {fmtG(v.grams)} g · {v.units} u
              </Badge>
            ))}
          </div>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCartonOpen(true)}>
              <Package className="mr-1 h-4 w-4" /> Master Case
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" /> Sac
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {containers.length === 0 && (
          <p className="text-sm italic text-muted-foreground">
            Aucun contenant. Ajoute des sacs pour suivre le stock unité par unité.
          </p>
        )}
        {[...groups.entries()].map(([key, list]) => {
          const carton = key === NO_CARTON ? null : cartonMap[key];
          const net = list.reduce((s, c) => s + Number(c.net_weight_grams ?? 0), 0);
          const units = list.reduce((s, c) => s + Number(c.unit_count ?? 0), 0);
          if (list.length === 0 && !carton) return null;
          return (
            <div key={key} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  {carton ? carton.carton_code : "Hors Master Case"}
                  {carton?.location && (
                    <span className="text-xs text-muted-foreground">· {carton.location}</span>
                  )}
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {list.length} sac{list.length > 1 ? "s" : ""} · {fmtG(net)} g · {units} u
                </span>
              </div>
              {list.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sac</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Unités</TableHead>
                        <TableHead className="text-right">Poids / unité</TableHead>
                        <TableHead className="text-right">Net (g)</TableHead>
                        <TableHead className="text-right">Brut (g)</TableHead>
                        <TableHead>Emplacement</TableHead>
                        <TableHead>Statut</TableHead>
                        {!readOnly && <TableHead className="w-24 text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-1">
                              {isBlockedContainer(c) && (
                                <Lock className="h-3.5 w-3.5 text-amber-400" />
                              )}
                              {c.container_code}
                            </span>
                          </TableCell>
                          <TableCell>
                            <ContainerTypeBadge type={c.container_type} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{c.unit_count}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtG(Number(c.unit_weight_grams ?? 0))}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtG(Number(c.net_weight_grams ?? 0))}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {c.gross_weight_grams != null ? fmtG(Number(c.gross_weight_grams)) : "—"}
                          </TableCell>
                          <TableCell>{c.location ?? "—"}</TableCell>
                          <TableCell>
                            <ContainerStatusBadge status={c.status} />
                          </TableCell>
                          {!readOnly && (
                            <TableCell className="text-right">
                              <Button size="icon" variant="ghost" onClick={() => setEditing(c)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => setToDelete(c)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>

      <ContainerDialog
        key={editing?.id ?? "new"}
        lotId={lotId}
        cartons={cartons}
        defaultType={defaultType}
        container={editing}
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={load}
      />

      <CartonDialog
        lotId={lotId}
        open={cartonOpen}
        onOpenChange={setCartonOpen}
        onSaved={load}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce sac ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le total du lot n'est pas ajusté automatiquement : utilise un événement pour les
              mouvements de stock réels.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ContainerDialog({
  lotId,
  cartons,
  container,
  defaultType,
  open,
  onOpenChange,
  onSaved,
}: {
  lotId: string;
  cartons: StockCarton[];
  container: StockContainer | null;
  defaultType: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(container?.container_code ?? "");
  const [type, setType] = useState(container?.container_type ?? defaultType);
  const [cartonId, setCartonId] = useState(container?.carton_id ?? NO_CARTON);
  const [unitCount, setUnitCount] = useState(String(container?.unit_count ?? 1));
  const [unitWeight, setUnitWeight] = useState(String(container?.unit_weight_grams ?? ""));
  const [net, setNet] = useState(
    container ? String(container.net_weight_grams ?? "") : "",
  );
  const [gross, setGross] = useState(
    container?.gross_weight_grams != null ? String(container.gross_weight_grams) : "",
  );
  const [location, setLocation] = useState(container?.location ?? "");
  const [status, setStatus] = useState(container?.status ?? "available");
  const [saving, setSaving] = useState(false);

  const computedNet = (Number(unitCount) || 0) * (Number(unitWeight) || 0);
  const effectiveNet = net.trim() ? Number(net) : computedNet;

  const submit = async () => {
    if (!code.trim()) return toast.error("Identifiant du sac requis");
    const uc = Number(unitCount);
    if (Number.isNaN(uc) || uc < 0) return toast.error("Nombre d'unités invalide");
    if (!effectiveNet || effectiveNet <= 0) return toast.error("Poids net > 0 requis");
    setSaving(true);
    const payload = {
      lot_id: lotId,
      carton_id: cartonId === NO_CARTON ? null : cartonId,
      container_code: code.trim(),
      container_type: type,
      unit_count: uc,
      unit_weight_grams: Number(unitWeight) || (uc > 0 ? effectiveNet / uc : 0),
      net_weight_grams: effectiveNet,
      gross_weight_grams: gross.trim() ? Number(gross) : null,
      location: location.trim() || null,
      status,
    };
    const { error } = container
      ? await supabase.from("stock_containers").update(payload).eq("id", container.id)
      : await supabase.from("stock_containers").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(
        error.code === "23505" ? "Cet identifiant de sac existe déjà pour ce lot" : error.message,
      );
      return;
    }
    toast.success(container ? "Sac mis à jour" : "Sac ajouté");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{container ? "Modifier le sac" : "Nouveau sac"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Identifiant du sac *</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SAC-01" />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTAINER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Master Case</Label>
            <Select value={cartonId} onValueChange={setCartonId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CARTON}>Hors Master Case</SelectItem>
                {cartons.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.carton_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Unités</Label>
              <Input
                type="number"
                min="0"
                value={unitCount}
                onChange={(e) => setUnitCount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Poids / unité (g)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={unitWeight}
                onChange={(e) => setUnitWeight(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Poids net (g)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={net}
                onChange={(e) => setNet(e.target.value)}
                placeholder={computedNet ? fmtG(computedNet) : ""}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Poids brut (g)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={gross}
                onChange={(e) => setGross(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Emplacement</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Statut</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTAINER_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Poids net calculé : {fmtG(effectiveNet)} g
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {container ? "Enregistrer" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CartonDialog({
  lotId,
  open,
  onOpenChange,
  onSaved,
}: {
  lotId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!code.trim()) return toast.error("Identifiant du Master Case requis");
    setSaving(true);
    const { error } = await supabase.from("stock_cartons").insert({
      lot_id: lotId,
      carton_code: code.trim(),
      location: location.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Master Case créé");
    setCode("");
    setLocation("");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau Master Case</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Identifiant du Master Case *</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MC-1" />
          </div>
          <div className="grid gap-2">
            <Label>Emplacement</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
