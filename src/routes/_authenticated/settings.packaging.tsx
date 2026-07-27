import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  FORMAT_TYPES,
  FORMAT_TYPE_CLASS,
  formatNetGrams,
  formatTypeLabel,
  usePackagingFormats,
  type PackagingFormat,
} from "@/lib/packaging-formats";

export const Route = createFileRoute("/_authenticated/settings/packaging")({
  head: () => ({
    meta: [
      { title: "Formats de packaging — ONO Cannabis" },
      {
        name: "description",
        content:
          "Gérer les formats d'emballage (fleur et pré-roulés) utilisés dans le packaging, l'inventaire et les réceptions.",
      },
      { property: "og:title", content: "Formats de packaging — ONO Cannabis" },
      {
        property: "og:description",
        content: "Créer, modifier et activer les formats d'emballage de l'usine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PackagingFormatsPage,
});

function PackagingFormatsPage() {
  const { roles } = useAuth();
  const canEdit = roles.includes("admin") || roles.includes("supervisor");
  const { formats, loading, reload } = usePackagingFormats(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PackagingFormat | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleActive = async (f: PackagingFormat) => {
    setBusyId(f.id);
    const { error } = await supabase
      .from("packaging_formats")
      .update({ is_active: !f.is_active })
      .eq("id", f.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(f.is_active ? "Format désactivé" : "Format activé");
    reload();
  };

  const remove = async (f: PackagingFormat) => {
    if (!confirm(`Supprimer le format « ${f.name} » ?`)) return;
    setBusyId(f.id);
    const { error } = await supabase.from("packaging_formats").delete().eq("id", f.id);
    setBusyId(null);
    if (error) {
      toast.error(
        "Impossible de supprimer ce format (il est peut-être utilisé). Désactivez-le à la place.",
      );
      return;
    }
    toast.success("Format supprimé");
    reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/settings">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour aux paramètres
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Formats de packaging</h1>
          <p className="text-sm text-muted-foreground">
            Ces formats alimentent le bulk packaging, les sacs d'inventaire et les réceptions
            structurées.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Nouveau format
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste des formats</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : formats.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Aucun format défini.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Unités / paquet</TableHead>
                    <TableHead className="text-right">Poids / unité (g)</TableHead>
                    <TableHead className="text-right">Net (g)</TableHead>
                    <TableHead>Actif</TableHead>
                    {canEdit && <TableHead className="w-24 text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formats.map((f) => (
                    <TableRow key={f.id} className={f.is_active ? "" : "opacity-60"}>
                      <TableCell className="font-medium">{f.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={FORMAT_TYPE_CLASS[f.format_type] ?? ""}>
                          {formatTypeLabel(f.format_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{f.units_per_pack}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(f.unit_weight_grams)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatNetGrams(f)}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={f.is_active}
                          disabled={!canEdit || busyId === f.id}
                          onCheckedChange={() => toggleActive(f)}
                        />
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditing(f);
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => remove(f)}>
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
        </CardContent>
      </Card>

      <FormatDialog
        key={editing?.id ?? "new"}
        format={editing}
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        onSaved={reload}
      />
    </div>
  );
}

function FormatDialog({
  format,
  open,
  onOpenChange,
  onSaved,
}: {
  format: PackagingFormat | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(format?.name ?? "");
  const [type, setType] = useState(format?.format_type ?? "flower");
  const [units, setUnits] = useState(String(format?.units_per_pack ?? 1));
  const [unitWeight, setUnitWeight] = useState(String(format?.unit_weight_grams ?? ""));
  const [active, setActive] = useState(format?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(String(format?.sort_order ?? 100));
  const [saving, setSaving] = useState(false);

  const net = (Number(units) || 0) * (Number(unitWeight) || 0);

  const submit = async () => {
    if (!name.trim()) return toast.error("Le nom est obligatoire");
    const u = Number(units);
    const w = Number(unitWeight);
    if (!u || u < 1) return toast.error("Unités / paquet doit être ≥ 1");
    if (!w || w <= 0) return toast.error("Poids par unité > 0 obligatoire");
    setSaving(true);
    const payload = {
      name: name.trim(),
      format_type: type,
      units_per_pack: Math.round(u),
      unit_weight_grams: w,
      net_weight_grams: net,
      is_active: active,
      sort_order: Number(sortOrder) || 0,
    };
    const { error } = format
      ? await supabase.from("packaging_formats").update(payload).eq("id", format.id)
      : await supabase.from("packaging_formats").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(
        error.code === "23505" ? "Un format porte déjà ce nom" : error.message,
      );
      return;
    }
    toast.success(format ? "Format mis à jour" : "Format créé");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{format ? "Modifier le format" : "Nouveau format"}</DialogTitle>
          <DialogDescription>
            Le poids net est calculé automatiquement : unités × poids unitaire.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Nom affiché *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. 3.5 g ou 5 × 0.5 g"
            />
          </div>
          <div className="grid gap-2">
            <Label>Type *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Unités / paquet *</Label>
              <Input
                type="number"
                min="1"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Poids / unité (g) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={unitWeight}
                onChange={(e) => setUnitWeight(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Net (g)</Label>
              <div className="flex h-9 items-center rounded-md border border-border/60 bg-muted/40 px-2 text-sm tabular-nums">
                {net.toFixed(2).replace(/\.00$/, "")}
              </div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
            <div className="grid gap-2">
              <Label>Ordre d'affichage</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 pb-1">
              <Switch checked={active} onCheckedChange={setActive} />
              <Label className="mb-0">Actif</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
