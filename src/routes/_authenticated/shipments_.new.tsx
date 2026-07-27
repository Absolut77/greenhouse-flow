import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, Trash2, Truck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import type { Tables } from "@/integrations/supabase/types";
import { SHIPMENT_KINDS } from "./events";
import { PRODUCT_TYPES } from "./inventory";
import {
  containerTypeLabel,
  fetchContainersForLots,
  fmtG,
  isUsableContainer,
  type StockContainer,
} from "@/lib/containers";

type Lot = Tables<"inventory_lots">;
type Batch = Tables<"batches">;

const NO_CONTAINER = "__no_container__";

type Line = {
  lot_id: string;
  container_id: string;
  grams: string;
  units: string;
};

export const Route = createFileRoute("/_authenticated/shipments_/new")({
  head: () => ({ meta: [{ title: "Nouvelle expédition — ONO Cannabis" }] }),
  component: NewShipmentPage,
});

function todayISODate() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function autoEventNumber() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `SHP-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const productLabel = (v: string | null | undefined) =>
  PRODUCT_TYPES.find((p) => p.value === v)?.label ?? v ?? "—";

function NewShipmentPage() {
  const navigate = useNavigate();

  const [kind, setKind] = useState<string>("out_of_facility");
  const [eventNumber, setEventNumber] = useState(autoEventNumber());
  const [shipDate, setShipDate] = useState(todayISODate());
  const [destination, setDestination] = useState("");
  const [carrier, setCarrier] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [markCompleted, setMarkCompleted] = useState(true);

  const [lots, setLots] = useState<Lot[]>([]);
  const [batches, setBatches] = useState<Record<string, Batch>>({});
  const [lines, setLines] = useState<Line[]>([{ lot_id: "", container_id: NO_CONTAINER, grams: "", units: "" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("inventory_lots")
        .select("*")
        .eq("status", "available")
        .order("created_at", { ascending: false });
      if (error) {
        toast.error(error.message);
        return;
      }
      setLots(data ?? []);
      const lotIds = (data ?? []).map((l) => l.id);
      if (lotIds.length > 0) {
        const cs = await fetchContainersForLots(lotIds).catch(() => []);
        const cm: Record<string, StockContainer[]> = {};
        cs.forEach((c) => {
          cm[c.lot_id] = [...(cm[c.lot_id] ?? []), c];
        });
        setContainersByLot(cm);
      }
      const bIds = Array.from(
        new Set((data ?? []).map((l) => l.batch_id).filter((x): x is string => !!x)),
      );
      if (bIds.length > 0) {
        const { data: bs } = await supabase.from("batches").select("*").in("id", bIds);
        const m: Record<string, Batch> = {};
        (bs ?? []).forEach((b) => (m[b.id] = b));
        setBatches(m);
      }
    })();
  }, []);

  const containersOf = (lotId: string) =>
    (containersByLot[lotId] ?? []).filter(isUsableContainer);

  /** Remaining stock for a line, container-aware. */
  const remainingForLine = (ln: Line, exceptIndex: number) => {
    if (ln.container_id !== NO_CONTAINER) {
      const c = (containersByLot[ln.lot_id] ?? []).find((x) => x.id === ln.container_id);
      if (!c) return { g: 0, u: 0, hasUnits: true };
      let g = Number(c.net_weight_grams ?? 0);
      let u = Number(c.unit_count ?? 0);
      lines.forEach((other, i) => {
        if (i === exceptIndex || other.container_id !== ln.container_id) return;
        g -= Number(other.grams) || 0;
        u -= Number(other.units) || 0;
      });
      return { g, u, hasUnits: true };
    }
    return remainingFor(ln.lot_id, exceptIndex);
  };

  const filteredLots = useMemo(() => {
    return lots.filter((l) => {
      if (kind === "lab_samples") return l.product_type === "sample";
      if (kind === "external_transformation")
        return l.product_type === "flower" || l.product_type === "trim";
      // out_of_facility: everything except pure samples
      return l.product_type !== "sample";
    });
  }, [lots, kind]);

  const lotOptions = useMemo(() => {
    return filteredLots.map((l) => {
      const b = l.batch_id ? batches[l.batch_id] : null;
      const label = `${l.lot_number}${b ? ` · ${b.batch_number}${b.strain ? ` (${b.strain})` : ""}` : ""} — ${productLabel(l.product_type)}`;
      return { lot: l, label };
    });
  }, [filteredLots, batches]);

  const remainingFor = (lotId: string, exceptIndex: number) => {
    const lot = lots.find((l) => l.id === lotId);
    if (!lot) return { g: 0, u: 0, hasUnits: false };
    let g = Number(lot.quantity_grams ?? 0);
    let u = Number(lot.units ?? 0);
    lines.forEach((ln, i) => {
      if (i === exceptIndex || ln.lot_id !== lotId) return;
      g -= Number(ln.grams) || 0;
      u -= Number(ln.units) || 0;
    });
    return { g, u, hasUnits: lot.units != null };
  };

  const updateLine = (i: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  };
  const addLine = () => setLines((p) => [...p, { lot_id: "", container_id: NO_CONTAINER, grams: "", units: "" }]);
  const removeLine = (i: number) =>
    setLines((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));

  const totalGrams = lines.reduce((s, l) => s + (Number(l.grams) || 0), 0);
  const totalUnits = lines.reduce((s, l) => s + (Number(l.units) || 0), 0);

  const submit = async () => {
    if (!eventNumber.trim()) return toast.error("Numéro d'événement requis");
    if (lines.length === 0) return toast.error("Ajoutez au moins une ligne");
    for (const [i, ln] of lines.entries()) {
      if (!ln.lot_id) return toast.error(`Ligne ${i + 1} : sélectionnez un lot`);
      const g = Number(ln.grams);
      if (!g || g <= 0) return toast.error(`Ligne ${i + 1} : quantité (g) > 0 requise`);
      const rem = remainingFor(ln.lot_id, i);
      if (g > rem.g + 1e-6)
        return toast.error(`Ligne ${i + 1} : stock insuffisant (${rem.g}g dispo)`);
      if (ln.units.trim()) {
        const u = Number(ln.units);
        if (Number.isNaN(u) || u < 0)
          return toast.error(`Ligne ${i + 1} : unités invalides`);
        if (u > rem.u)
          return toast.error(`Ligne ${i + 1} : unités insuffisantes (${rem.u} dispo)`);
      }
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const completedAt = markCompleted ? new Date(`${shipDate}T12:00:00`).toISOString() : null;
    const { data: ev, error } = await supabase
      .from("events")
      .insert({
        event_number: eventNumber.trim(),
        event_type: "shipment",
        shipment_kind: kind,
        destination: destination.trim() || null,
        carrier: carrier.trim() || null,
        reference_number: reference.trim() || null,
        notes: notes.trim() || null,
        status: markCompleted ? "completed" : "open",
        completed_at: completedAt,
        created_by: userData.user?.id ?? null,
      } as any)
      .select()
      .single();

    if (error || !ev) {
      setSaving(false);
      if (error?.code === "23505") toast.error("Ce numéro d'événement existe déjà");
      else toast.error(error?.message ?? "Échec création événement");
      return;
    }

    const rows = lines.map((l) => ({
      event_id: ev.id,
      inventory_lot_id: l.lot_id,
      quantity_grams: Number(l.grams),
      units: l.units.trim() ? Number(l.units) : null,
      direction: "out",
    }));
    const { error: itemsErr } = await supabase.from("event_items").insert(rows);
    if (itemsErr) {
      // Roll back: delete the event we just created (no items yet) to avoid orphan
      await supabase.from("events").delete().eq("id", ev.id);
      setSaving(false);
      toast.error(`Échec ajout items : ${itemsErr.message}`);
      return;
    }

    setSaving(false);
    toast.success("Expédition créée — stock déduit automatiquement");
    navigate({ to: "/events/$id", params: { id: ev.id } });
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/events">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour aux événements
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" /> Nouvelle expédition
          </CardTitle>
          <CardDescription>
            Sélectionnez plusieurs lots à expédier. Le stock est déduit automatiquement
            à la création. Les timbres restent attachés aux lots packagés expédiés.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Numéro d'événement *</Label>
              <Input value={eventNumber} onChange={(e) => setEventNumber(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Type d'expédition *</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIPMENT_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Date d'expédition</Label>
              <Input type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Destination</Label>
              <Input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="SQDC, Nuance, Labo XYZ..."
              />
            </div>
            <div className="grid gap-2">
              <Label>Transporteur</Label>
              <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Purolator, interne..." />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Référence / manifeste</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Numéro de bordereau, PO..."
            />
          </div>

          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={markCompleted}
              onChange={(e) => setMarkCompleted(e.target.checked)}
            />
            Marquer comme complétée immédiatement (verrouille l'événement)
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Palette — lots à expédier</CardTitle>
            <CardDescription>
              {filteredLots.length} lot{filteredLots.length > 1 ? "s" : ""} disponible{filteredLots.length > 1 ? "s" : ""} pour ce type.
            </CardDescription>
          </div>
          <Button size="sm" onClick={addLine}>
            <Plus className="mr-1 h-4 w-4" /> Ajouter une ligne
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[280px]">Lot</TableHead>
                  <TableHead className="w-[140px]">Quantité (g)</TableHead>
                  <TableHead className="w-[120px]">Unités</TableHead>
                  <TableHead className="w-[200px]">Restant après</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((ln, i) => {
                  const lot = lots.find((l) => l.id === ln.lot_id);
                  const rem = ln.lot_id ? remainingFor(ln.lot_id, i) : null;
                  const g = Number(ln.grams) || 0;
                  const u = Number(ln.units) || 0;
                  const remAfterG = rem ? rem.g - g : 0;
                  const remAfterU = rem ? rem.u - u : 0;
                  const invalid = rem && (g > rem.g + 1e-6 || (ln.units.trim() && u > rem.u));
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <Select
                          value={ln.lot_id}
                          onValueChange={(v) => updateLine(i, { lot_id: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner un lot" />
                          </SelectTrigger>
                          <SelectContent>
                            {lotOptions.length === 0 && (
                              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                Aucun lot correspondant en stock
                              </div>
                            )}
                            {lotOptions.map((o) => (
                              <SelectItem key={o.lot.id} value={o.lot.id}>
                                {o.label} · {o.lot.quantity_grams ?? 0}g
                                {o.lot.units != null ? ` · ${o.lot.units}u` : ""}
                                {o.lot.location ? ` · ${o.lot.location}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {lot && (
                          <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                            <Badge variant="outline">{productLabel(lot.product_type)}</Badge>
                            {lot.location && <Badge variant="outline">{lot.location}</Badge>}
                            {lot.parent_lot_id && <Badge variant="outline">packagé</Badge>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={ln.grams}
                          onChange={(e) => updateLine(i, { grams: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          value={ln.units}
                          onChange={(e) => updateLine(i, { units: e.target.value })}
                          disabled={!lot || lot.units == null}
                          placeholder={lot && lot.units == null ? "—" : ""}
                        />
                      </TableCell>
                      <TableCell>
                        {rem ? (
                          <span className={invalid ? "text-destructive" : "text-muted-foreground"}>
                            {remAfterG.toFixed(2)}g
                            {rem.hasUnits ? ` · ${remAfterU}u` : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeLine(i)}
                          disabled={lines.length === 1}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3 text-sm">
            <span className="text-muted-foreground">
              {lines.length} ligne{lines.length > 1 ? "s" : ""} · Total à expédier
            </span>
            <span className="font-semibold">
              {totalGrams.toFixed(2)} g{totalUnits > 0 ? ` · ${totalUnits} unités` : ""}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate({ to: "/events" })}>
          Annuler
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Créer l'expédition
        </Button>
      </div>
    </div>
  );
}
