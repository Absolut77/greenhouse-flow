import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { AutoNumberButton } from "@/lib/auto-number";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  cartonTotals,
  deriveLotMeta,
  emptyCarton,
  expandCartons,
  validateCartons,
  type CartonDraft,
} from "@/components/inventory/carton-builder";
import { fmtG } from "@/lib/containers";
import { usePackagingFormats } from "@/lib/packaging-formats";
import {
  StampAssignment,
  emptyStampSelection,
  useAvailableReels,
  validateStampSelection,
  type StampSelection,
} from "@/components/stamps/stamp-assignment";
import { applyStampsToLot } from "@/lib/stamps";



type Batch = Tables<"batches">;

const NONE = "__none__";
const NEW_SUB = "__new_sub__";

export const Route = createFileRoute("/_authenticated/inventory_/new")({
  head: () => ({
    meta: [
      { title: "Nouveau lot — ONO Cannabis" },
      {
        name: "description",
        content:
          "Créer un lot d'inventaire rattaché à une batch ou une sous-batch, puis ajouter ses sacs.",
      },
    ],
  }),
  component: NewLotPage,
});

function NewLotPage() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<Batch[]>([]);

  const [batchId, setBatchId] = useState<string>(NONE);
  const [lotNumber, setLotNumber] = useState("");
  const [lotName, setLotName] = useState("");
  const [location, setLocation] = useState("Voute - 155");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Sous-batch (ex: NU001 liée à la Batch 130)
  const [subParentId, setSubParentId] = useState<string>(NONE);
  const [subNumber, setSubNumber] = useState("");
  const [subProcessor, setSubProcessor] = useState("Nuance");

  // Sacs
  const [withBags, setWithBags] = useState(true);
  const [cartons, setCartons] = useState<CartonDraft[]>([emptyCarton(1)]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("batches")
        .select("*")
        .order("created_at", { ascending: false });
      setBatches(data ?? []);
    })();
  }, []);

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === batchId) ?? null,
    [batches, batchId],
  );
  const parentBatch = useMemo(
    () => batches.find((b) => b.id === subParentId) ?? null,
    [batches, subParentId],
  );
  const isNewSub = batchId === NEW_SUB;

  // Numéro/nom du lot suivent la batch choisie (modifiables).
  useEffect(() => {
    if (isNewSub) {
      if (subNumber.trim()) setLotNumber(subNumber.trim());
      setLotName(parentBatch?.strain ?? "");
      return;
    }
    if (selectedBatch) {
      setLotNumber(selectedBatch.batch_number);
      setLotName(selectedBatch.strain ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, subNumber, parentBatch?.id, selectedBatch?.id]);

  const totals = cartonTotals(cartons);
  const { formats } = usePackagingFormats();
  const meta = deriveLotMeta(withBags ? cartons : [], formats);

  // Timbres d'accise : uniquement pour les lots Mastercase / packagés.
  const { reels, loading: reelsLoading } = useAvailableReels();
  const [stamp, setStamp] = useState<StampSelection>(emptyStampSelection());
  const isPackagedLot = withBags && meta.lot_kind === "packaged";
  const stampableUnits = withBags
    ? cartons
        .flatMap((c) => c.bags)
        .filter((b) => b.type === "packaged" || b.type === "preroll")
        .reduce(
          (s, b) =>
            s + Math.max(Math.round(Number(b.copies) || 0), 0) * Math.round(Number(b.units) || 0),
          0,
        )
    : 0;


  const submit = async () => {
    if (!lotNumber.trim()) {
      toast.error("Le numéro de lot est obligatoire");
      return;
    }
    if (withBags && (totals.bags === 0 || totals.grams <= 0)) {
      toast.error("Ajoutez au moins un sac avec un poids > 0");
      return;
    }
    const stampError = validateStampSelection(stamp, reels);
    if (stampError) {
      toast.error(stampError);
      return;
    }
    if (withBags) {

      const invalid = validateCartons(cartons);
      if (invalid) {
        toast.error(invalid);
        return;
      }
    }


    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      let finalBatchId: string | null = null;

      if (isNewSub) {
        if (!subNumber.trim()) throw new Error("Numéro de sous-batch requis");
        if (subParentId === NONE) throw new Error("Batch source requise");
        const { data: sub, error: sErr } = await supabase
          .from("batches")
          .insert({
            batch_number: subNumber.trim(),
            strain: parentBatch?.strain ?? null,
            parent_batch_id: subParentId,
            external_processor: subProcessor.trim() || null,
            status: "in_progress",
            created_by: userId,
          } as never)
          .select()
          .single();
        if (sErr) throw sErr;
        finalBatchId = sub.id;
      } else if (batchId !== NONE) {
        finalBatchId = batchId;
      }

      const { data: lot, error } = await supabase
        .from("inventory_lots")
        .insert({
          lot_number: lotNumber.trim(),
          batch_id: finalBatchId,
          quantity_grams: 0,
          units: 0,
          location: location.trim() || null,
          status: "available",
          lot_kind: meta.lot_kind,
          product_type: meta.product_type,
          format: meta.format,
          flower_size: meta.flower_size,

          notes:
            [lotName.trim() ? `Variété : ${lotName.trim()}` : "", notes.trim()]
              .filter(Boolean)
              .join(" — ") || null,
        } as never)
        .select()
        .single();
      if (error) {
        if ((error as { code?: string }).code === "23505")
          throw new Error("Ce numéro de lot existe déjà");
        throw error;
      }

      if (withBags) {
        let grams = 0;
        let units = 0;
        for (const { carton, bags } of expandCartons(cartons)) {
          if (bags.length === 0) continue;
          const { data: ct, error: cErr } = await supabase
            .from("stock_cartons")
            .insert({
              lot_id: lot.id,
              carton_code: carton.code.trim() || "A",
              location: carton.location.trim() || location.trim() || null,
              created_by: userId,
            } as never)
            .select()
            .single();
          if (cErr) throw cErr;
          const { error: bErr } = await supabase.from("stock_containers").insert(
            bags.map((b) => ({
              lot_id: lot.id,
              carton_id: ct.id,
              container_code: b.container_code,
              container_type: b.container_type,
              unit_count: b.unit_count,
              unit_weight_grams: b.unit_weight_grams,
              net_weight_grams: b.net_weight_grams,
              gross_weight_grams: b.gross_weight_grams,
              location: b.location ?? location.trim() ?? null,
              format_id: b.format_id,
              notes: b.notes,
              status: "available",
              created_by: userId,
            })) as never,
          );
          if (bErr) throw bErr;
          grams += bags.reduce((a, b) => a + b.net_weight_grams, 0);
          units += bags.reduce((a, b) => a + b.unit_count, 0);
        }
        const { error: uErr } = await supabase
          .from("inventory_lots")
          .update({ quantity_grams: grams, units } as never)
          .eq("id", lot.id);
        if (uErr) throw uErr;
      }

      if (stamp.enabled) {
        try {
          await applyStampsToLot({
            reelId: stamp.reelId,
            lotId: lot.id,
            quantity: Number(stamp.quantity),
            comments: `Timbrage du lot ${lotNumber.trim()}`,
          });
        } catch (e) {
          toast.error(
            `Lot créé, mais le timbrage a échoué : ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
          navigate({ to: "/inventory/$id", params: { id: lot.id } });
          return;
        }
      }

      toast.success(stamp.enabled ? "Lot créé et timbré" : "Lot créé");
      navigate({ to: "/inventory/$id", params: { id: lot.id } });

    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/inventory">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour à l'inventaire
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nouveau lot</CardTitle>
          <CardDescription>
            La batch est recommandée (traçabilité) mais reste optionnelle pour les cas
            historiques ou spéciaux.
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
                <SelectItem value={NEW_SUB}>+ Créer une sous-batch (ex: NU001)</SelectItem>
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

          {isNewSub && (
            <div className="grid gap-4 rounded-md border border-border/60 bg-muted/20 p-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Numéro de sous-batch *</Label>
                <Input
                  value={subNumber}
                  onChange={(e) => setSubNumber(e.target.value)}
                  placeholder="NU001"
                />
              </div>
              <div className="grid gap-2">
                <Label>Batch source *</Label>
                <Select value={subParentId} onValueChange={setSubParentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Batch 130..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {batches
                      .filter((b) => !b.parent_batch_id)
                      .map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.batch_number}
                          {b.strain ? ` — ${b.strain}` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Transformateur</Label>
                <Input
                  value={subProcessor}
                  onChange={(e) => setSubProcessor(e.target.value)}
                  placeholder="Nuance"
                />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Numéro de lot *</Label>
              <div className="flex gap-2">
                <Input
                  value={lotNumber}
                  onChange={(e) => setLotNumber(e.target.value)}
                  placeholder="= numéro de batch / sous-batch"
                />
                <AutoNumberButton kind="lot" onGenerated={setLotNumber} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Nom (variété)</Label>
              <Input
                value={lotName}
                onChange={(e) => setLotName(e.target.value)}
                placeholder="Auto depuis la batch"
              />
            </div>
            <div className="grid gap-2">
              <Label>Emplacement</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="ex: Vault A, Zone B2..."
              />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Création</p>
                <p className="text-xs text-muted-foreground">
                  Cartons A, B, C… et sacs 1, 2, 3… — les champs s'adaptent au type de sac.
                </p>
              </div>
              <Switch checked={withBags} onCheckedChange={setWithBags} />
            </div>
            {withBags && (
              <>
                <CartonBuilder cartons={cartons} onChange={setCartons} />
                <p className="text-sm tabular-nums">
                  Total : <strong>{totals.bags}</strong> sac(s) ·{" "}
                  <strong>{totals.units}</strong> unité(s) ·{" "}
                  <strong>{fmtG(totals.grams)} g</strong>
                </p>
              </>
            )}
          </div>

          {isPackagedLot && (
            <StampAssignment
              value={stamp}
              onChange={setStamp}
              suggestedUnits={stampableUnits}
              reels={reels}
              loading={reelsLoading}
            />
          )}



          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => navigate({ to: "/inventory" })}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Créer le lot
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
