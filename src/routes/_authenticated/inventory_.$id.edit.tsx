import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import {
  CartonBuilder,
  NO_FORMAT,
  cartonLetter,
  cartonTotals,
  expandCartonsForEdit,
  flowerSizeFromNotes,
  type CartonDraft,
} from "@/components/inventory/carton-builder";
import { fmtG } from "@/lib/containers";

type Lot = Tables<"inventory_lots">;
type Batch = Tables<"batches">;
type Carton = Tables<"stock_cartons">;
type Container = Tables<"stock_containers">;

const NONE = "__none__";

export const Route = createFileRoute("/_authenticated/inventory_/$id/edit")({
  head: () => ({
    meta: [
      { title: "Modifier le lot — ONO Cannabis" },
      {
        name: "description",
        content:
          "Modifier les informations d'un lot d'inventaire ainsi que ses cartons et ses sacs.",
      },
    ],
  }),
  component: EditLotPage,
});

/** Sépare "Variété : X — notes" en { name, notes }. */
function splitNotes(raw: string | null) {
  if (!raw) return { name: "", notes: "" };
  const m = raw.match(/^Variété\s*:\s*([^—]*)(?:—\s*(.*))?$/s);
  if (!m) return { name: "", notes: raw };
  return { name: (m[1] ?? "").trim(), notes: (m[2] ?? "").trim() };
}

function EditLotPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState<string>(NONE);
  const [lotNumber, setLotNumber] = useState("");
  const [lotName, setLotName] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [cartons, setCartons] = useState<CartonDraft[]>([]);

  // Etat initial pour calculer les suppressions.
  const [initialCartonIds, setInitialCartonIds] = useState<string[]>([]);
  const [initialContainers, setInitialContainers] = useState<Container[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      const [{ data: lot, error: lErr }, { data: bs }] = await Promise.all([
        supabase.from("inventory_lots").select("*").eq("id", id).maybeSingle(),
        supabase.from("batches").select("*").order("created_at", { ascending: false }),
      ]);
      if (lErr || !lot) {
        setError(lErr?.message ?? "Lot introuvable");
        setLoading(false);
        return;
      }
      setBatches(bs ?? []);

      const l = lot as Lot;
      setLotNumber(l.lot_number);
      setBatchId(l.batch_id ?? NONE);
      setLocation(l.location ?? "");
      const parsed = splitNotes(l.notes);
      setLotName(parsed.name);
      setNotes(parsed.notes);

      const [{ data: cts }, { data: cns }] = await Promise.all([
        supabase
          .from("stock_cartons")
          .select("*")
          .eq("lot_id", id)
          .order("carton_code", { ascending: true }),
        supabase
          .from("stock_containers")
          .select("*")
          .eq("lot_id", id)
          .order("container_code", { ascending: true }),
      ]);

      const cartonRows = (cts ?? []) as Carton[];
      const containerRows = (cns ?? []) as Container[];
      setInitialCartonIds(cartonRows.map((c) => c.id));
      setInitialContainers(containerRows);

      const toBag = (c: Container, inCarton: boolean) => ({
        id: c.id,
        code: inCarton ? (c.container_code.split("/").pop() ?? c.container_code) : c.container_code,
        type: c.container_type,
        copies: "1",
        units: String(c.unit_count ?? 1),
        unitWeight: String(Number(c.unit_weight_grams ?? 0)),
        weight: String(Number(c.net_weight_grams ?? 0)),
        gross: c.gross_weight_grams != null ? String(Number(c.gross_weight_grams)) : "",
        formatId: c.format_id ?? NO_FORMAT,
        flowerSize: flowerSizeFromNotes(c.notes),
        notes: c.notes,
      });

      const drafts: CartonDraft[] = cartonRows.map((c) => ({
        id: c.id,
        code: c.carton_code,
        location: c.location ?? "",
        bags: containerRows.filter((x) => x.carton_id === c.id).map((x) => toBag(x, true)),
      }));

      const orphans = containerRows.filter((x) => !x.carton_id);
      if (orphans.length > 0) {
        drafts.push({
          id: null,
          noCarton: true,
          code: "",
          location: "",
          bags: orphans.map((x) => toBag(x, false)),
        });
      }

      setCartons(drafts);
      setLoading(false);
    })();
  }, [id]);

  const totals = cartonTotals(cartons);

  const submit = async () => {
    if (!lotNumber.trim()) {
      toast.error("Le numéro de lot est obligatoire");
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      const expanded = expandCartonsForEdit(cartons);

      // 1) Contenants supprimés : vérifier la traçabilité avant toute écriture.
      const keptContainerIds = new Set(
        expanded.flatMap((e) => e.bags.map((b) => b.id).filter(Boolean) as string[]),
      );
      const removed = initialContainers.filter((c) => !keptContainerIds.has(c.id));
      if (removed.length > 0) {
        const locked = removed.filter((c) => c.status !== "available");
        if (locked.length > 0) {
          throw new Error(
            `Impossible de supprimer des sacs déjà mouvementés : ${locked
              .map((c) => c.container_code)
              .join(", ")}`,
          );
        }
        const { data: used, error: uErr } = await supabase
          .from("event_items")
          .select("container_id")
          .in(
            "container_id",
            removed.map((c) => c.id),
          );
        if (uErr) throw uErr;
        if ((used ?? []).length > 0) {
          const usedIds = new Set((used ?? []).map((u) => u.container_id));
          throw new Error(
            `Sacs liés à des événements, suppression refusée : ${removed
              .filter((c) => usedIds.has(c.id))
              .map((c) => c.container_code)
              .join(", ")}`,
          );
        }
      }

      // 2) Cartons : mise à jour / création.
      const keptCartonIds: string[] = [];
      const cartonIdByIndex = new Map<number, string | null>();
      for (let i = 0; i < expanded.length; i++) {
        const c = expanded[i].carton;
        if (c.noCarton) {
          cartonIdByIndex.set(i, null);
          continue;
        }
        const code = c.code.trim() || cartonLetter(i + 1);
        if (c.id) {
          const { error: e } = await supabase
            .from("stock_cartons")
            .update({ carton_code: code, location: c.location.trim() || null } as never)
            .eq("id", c.id);
          if (e) throw e;
          keptCartonIds.push(c.id);
          cartonIdByIndex.set(i, c.id);
        } else {
          const { data: ins, error: e } = await supabase
            .from("stock_cartons")
            .insert({
              lot_id: id,
              carton_code: code,
              location: c.location.trim() || location.trim() || null,
              created_by: userId,
            } as never)
            .select()
            .single();
          if (e) throw e;
          keptCartonIds.push(ins.id);
          cartonIdByIndex.set(i, ins.id);
        }
      }

      // 3) Contenants : mise à jour / création.
      for (let i = 0; i < expanded.length; i++) {
        const cartonId = cartonIdByIndex.get(i) ?? null;
        const { bags } = expanded[i];
        const inserts = [];
        for (const b of bags) {
          const payload = {
            carton_id: cartonId,
            container_code: b.container_code,
            container_type: b.container_type,
            unit_count: b.unit_count,
            unit_weight_grams: b.unit_weight_grams,
            net_weight_grams: b.net_weight_grams,
            gross_weight_grams: b.gross_weight_grams,
            location: b.location ?? location.trim() ?? null,
            format_id: b.format_id,
            notes: b.notes,
          };
          if (b.id) {
            const { error: e } = await supabase
              .from("stock_containers")
              .update(payload as never)
              .eq("id", b.id);
            if (e) throw e;
          } else {
            inserts.push({
              ...payload,
              lot_id: id,
              status: "available",
              created_by: userId,
            });
          }
        }
        if (inserts.length > 0) {
          const { error: e } = await supabase
            .from("stock_containers")
            .insert(inserts as never);
          if (e) throw e;
        }
      }

      // 4) Suppressions (contenants puis cartons orphelins).
      if (removed.length > 0) {
        const { error: e } = await supabase
          .from("stock_containers")
          .delete()
          .in(
            "id",
            removed.map((c) => c.id),
          );
        if (e) throw e;
      }
      const removedCartons = initialCartonIds.filter((cid) => !keptCartonIds.includes(cid));
      if (removedCartons.length > 0) {
        const { error: e } = await supabase
          .from("stock_cartons")
          .delete()
          .in("id", removedCartons);
        if (e) throw e;
      }

      // 5) Recalcul des totaux du lot depuis les contenants réellement en stock.
      const { data: fresh, error: fErr } = await supabase
        .from("stock_containers")
        .select("net_weight_grams, unit_count, status")
        .eq("lot_id", id);
      if (fErr) throw fErr;
      const live = (fresh ?? []).filter((c) => c.status === "available");
      const grams = live.reduce((a, c) => a + Number(c.net_weight_grams ?? 0), 0);
      const units = live.reduce((a, c) => a + Number(c.unit_count ?? 0), 0);

      const noteValue =
        [lotName.trim() ? `Variété : ${lotName.trim()}` : "", notes.trim()]
          .filter(Boolean)
          .join(" — ") || null;

      const { error: lotErr } = await supabase
        .from("inventory_lots")
        .update({
          lot_number: lotNumber.trim(),
          batch_id: batchId === NONE ? null : batchId,
          location: location.trim() || null,
          notes: noteValue,
          quantity_grams: grams,
          units,
        } as never)
        .eq("id", id);
      if (lotErr) {
        if ((lotErr as { code?: string }).code === "23505")
          throw new Error("Ce numéro de lot existe déjà");
        throw lotErr;
      }

      toast.success("Lot mis à jour");
      navigate({ to: "/inventory/$id", params: { id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/inventory">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour
          </Link>
        </Button>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/inventory/$id" params={{ id }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour au lot
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Modifier le lot</CardTitle>
          <CardDescription>
            Les totaux du lot sont recalculés automatiquement à partir des sacs. Les sacs
            déjà mouvementés ne peuvent pas être supprimés.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Batch</Label>
            <Select value={batchId} onValueChange={setBatchId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucune (saisie libre)</SelectItem>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.batch_number}
                    {b.strain ? ` — ${b.strain}` : ""}
                    {b.parent_batch_id ? " (sous-batch)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Numéro de lot *</Label>
              <Input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Nom (variété)</Label>
              <Input value={lotName} onChange={(e) => setLotName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Emplacement</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
            <div>
              <p className="text-sm font-medium">Cartons &amp; sacs</p>
              <p className="text-xs text-muted-foreground">
                Cartons A, B, C… et sacs 1, 2, 3… — les champs s'adaptent au type de sac.
              </p>
            </div>
            <CartonBuilder cartons={cartons} onChange={setCartons} />
            <p className="text-sm tabular-nums">
              Total : <strong>{totals.bags}</strong> sac(s) · <strong>{totals.units}</strong>{" "}
              unité(s) · <strong>{fmtG(totals.grams)} g</strong>
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => navigate({ to: "/inventory/$id", params: { id } })}
            >
              Annuler
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
