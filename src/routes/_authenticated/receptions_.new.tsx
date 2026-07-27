import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { PRODUCT_TYPES, FLOWER_SIZES } from "./inventory";
import { RECEPTION_KINDS } from "./events";
import {
  CartonBuilder,
  cartonTotals,
  emptyCarton,
  expandCartons,
  type CartonDraft,
} from "@/components/inventory/carton-builder";
import { Switch } from "@/components/ui/switch";

type Batch = Tables<"batches">;
type EventRow = Tables<"events">;
type EventItem = Tables<"event_items">;
type Lot = Tables<"inventory_lots">;

const NONE = "__none__";

export const Route = createFileRoute("/_authenticated/receptions_/new")({
  head: () => ({
    meta: [{ title: "Nouvelle réception — ONO Cannabis" }],
  }),
  component: NewReceptionPage,
});

type NonCannabisItem = {
  item_name: string;
  category: string;
  quantity: string;
  unit: string;
  location: string;
  notes: string;
};

type VarianceLine = {
  inventory_lot_id: string;
  sent_grams: number;
  sent_units: number;
  received_grams: string;
  received_units: string;
};

function todayISODate() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function autoEventNumber() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `REC-${stamp}`;
}

function NewReceptionPage() {
  const navigate = useNavigate();

  // Common
  const [kind, setKind] = useState<string>("cannabis_bulk");
  const [eventNumber, setEventNumber] = useState(autoEventNumber());
  const [receivedDate, setReceivedDate] = useState(todayISODate());
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Cannabis bulk / batch: link to batch or create new one
  const [batches, setBatches] = useState<Batch[]>([]);
  const [existingBatchId, setExistingBatchId] = useState<string>(NONE);
  // Cannabis lot fields (used by cannabis_bulk & cannabis_batch)
  const [productType, setProductType] = useState<string>("flower");
  const [format, setFormat] = useState("");
  const [flowerSize, setFlowerSize] = useState<string>(NONE);
  const [grams, setGrams] = useState("");
  const [units, setUnits] = useState("");
  const [location, setLocation] = useState("");
  const [structured, setStructured] = useState(false);
  const [cartons, setCartons] = useState<CartonDraft[]>([emptyCarton(1)]);
  const [existingLotIdBulk, setExistingLotIdBulk] = useState<string>(NONE);
  const [batchLots, setBatchLots] = useState<Lot[]>([]);

  // Cannabis new batch fields
  const [newBatchNumber, setNewBatchNumber] = useState("");
  const [newBatchStrain, setNewBatchStrain] = useState("");
  const [newBatchLotNumber, setNewBatchLotNumber] = useState("");

  // Non-cannabis
  const [items, setItems] = useState<NonCannabisItem[]>([
    { item_name: "", category: "", quantity: "", unit: "", location: "", notes: "" },
  ]);

  // Transformation return
  const [shipmentEvents, setShipmentEvents] = useState<EventRow[]>([]);
  const [linkedShipmentId, setLinkedShipmentId] = useState<string>(NONE);
  const [shipmentItems, setShipmentItems] = useState<EventItem[]>([]);
  const [shipmentLots, setShipmentLots] = useState<Record<string, Lot>>({});
  const [varianceLines, setVarianceLines] = useState<VarianceLine[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("batches")
        .select("*")
        .order("created_at", { ascending: false });
      setBatches(data ?? []);
    })();
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("*")
        .in("event_type", ["shipment", "transfer", "b2b"])
        .order("created_at", { ascending: false })
        .limit(100);
      setShipmentEvents(data ?? []);
    })();
  }, []);

  // Load lots for existing batch selection (bulk)
  useEffect(() => {
    if (existingBatchId === NONE) {
      setBatchLots([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("inventory_lots")
        .select("*")
        .eq("batch_id", existingBatchId)
        .order("created_at", { ascending: false });
      setBatchLots(data ?? []);
    })();
  }, [existingBatchId]);

  // Load items and lots for linked shipment
  useEffect(() => {
    if (linkedShipmentId === NONE) {
      setShipmentItems([]);
      setShipmentLots({});
      setVarianceLines([]);
      return;
    }
    (async () => {
      const { data: eis } = await supabase
        .from("event_items")
        .select("*")
        .eq("event_id", linkedShipmentId)
        .eq("direction", "out");
      const list = eis ?? [];
      setShipmentItems(list);
      const lotIds = Array.from(
        new Set(list.map((i) => i.inventory_lot_id).filter(Boolean) as string[])
      );
      if (lotIds.length) {
        const { data: lots } = await supabase
          .from("inventory_lots")
          .select("*")
          .in("id", lotIds);
        const map: Record<string, Lot> = {};
        (lots ?? []).forEach((l) => (map[l.id] = l));
        setShipmentLots(map);
      } else setShipmentLots({});
      setVarianceLines(
        list
          .filter((i) => i.inventory_lot_id)
          .map((i) => ({
            inventory_lot_id: i.inventory_lot_id!,
            sent_grams: Number(i.quantity_grams) || 0,
            sent_units: Number(i.units) || 0,
            received_grams: "",
            received_units: "",
          }))
      );
    })();
  }, [linkedShipmentId]);

  const totalReceived = useMemo(() => {
    return varianceLines.reduce(
      (acc, l) => ({
        g: acc.g + (Number(l.received_grams) || 0),
        u: acc.u + (Number(l.received_units) || 0),
      }),
      { g: 0, u: 0 }
    );
  }, [varianceLines]);
  const totalSent = useMemo(() => {
    return varianceLines.reduce(
      (acc, l) => ({ g: acc.g + l.sent_grams, u: acc.u + l.sent_units }),
      { g: 0, u: 0 }
    );
  }, [varianceLines]);

  const submit = async () => {
    if (!eventNumber.trim()) {
      toast.error("Le numéro d'événement est obligatoire");
      return;
    }
    if (!kind) {
      toast.error("Type de réception requis");
      return;
    }

    setSaving(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      // Track the batch that will be attached to the event
      let relatedBatchId: string | null = null;

      // --- Kind-specific pre-processing (creating batches / lots) ---
      let inventoryLotForBulk: string | null = null;
      const useCartons =
        structured && (kind === "cannabis_bulk" || kind === "cannabis_batch");
      const totals = cartonTotals(cartons);
      const effGrams = useCartons ? totals.grams : Number(grams);
      const effUnits = useCartons ? totals.units : units ? Number(units) : null;

      if (kind === "cannabis_bulk") {
        if (useCartons) {
          if (totals.bags === 0 || totals.grams <= 0)
            throw new Error("Saisissez au moins un sac avec un poids > 0");
        } else {
          const g = Number(grams);
          if (!grams || Number.isNaN(g) || g <= 0) {
            throw new Error("Quantité (g) > 0 requise");
          }
        }
        if (existingBatchId !== NONE) relatedBatchId = existingBatchId;

        if (existingLotIdBulk !== NONE) {
          inventoryLotForBulk = existingLotIdBulk;
        } else {
          // Create a new lot
          const lotNumber = `REC-${eventNumber}-${Date.now().toString().slice(-4)}`;
          const { data: lot, error } = await supabase
            .from("inventory_lots")
            .insert({
              lot_number: lotNumber,
              batch_id: relatedBatchId,
              product_type: productType || null,
              format: format.trim() || null,
              flower_size: flowerSize === NONE ? null : flowerSize,
              quantity_grams: 0, // trigger will add via event_items
              units: 0,
              location: location.trim() || null,
              status: "available",
              notes: `Créé via réception ${eventNumber}${supplier ? ` — ${supplier}` : ""}`,
            } as never)
            .select()
            .single();
          if (error) throw error;
          inventoryLotForBulk = lot.id;
        }
      } else if (kind === "cannabis_batch") {
        if (!newBatchNumber.trim() || !newBatchStrain.trim()) {
          throw new Error("Numéro de batch et variété requis");
        }
        if (useCartons) {
          if (totals.bags === 0 || totals.grams <= 0)
            throw new Error("Saisissez au moins un sac avec un poids > 0");
        } else {
          const g = Number(grams);
          if (!grams || Number.isNaN(g) || g <= 0) {
            throw new Error("Quantité (g) > 0 requise");
          }
        }
        // Create the batch (received from elsewhere → closed)
        const { data: b, error: bErr } = await supabase
          .from("batches")
          .insert({
            batch_number: newBatchNumber.trim(),
            strain: newBatchStrain.trim(),
            harvest_date: receivedDate,
            status: "in_progress",
            created_by: userId,
          } as never)
          .select()
          .single();
        if (bErr) throw bErr;
        relatedBatchId = b.id;
        const { data: lot, error: lErr } = await supabase
          .from("inventory_lots")
          .insert({
            lot_number: (newBatchLotNumber.trim() || newBatchNumber.trim()),
            batch_id: b.id,
            product_type: productType || null,
            format: format.trim() || null,
            flower_size: flowerSize === NONE ? null : flowerSize,
            quantity_grams: 0,
            units: 0,
            location: location.trim() || null,
            status: "available",
            notes: `Batch reçue de ${supplier || "producteur externe"}`,
          } as never)
          .select()
          .single();
        if (lErr) throw lErr;
        inventoryLotForBulk = lot.id;
      } else if (kind === "non_cannabis") {
        const validItems = items.filter((i) => i.item_name.trim());
        if (!validItems.length) throw new Error("Au moins un article requis");
      } else if (kind === "transformation_return") {
        if (linkedShipmentId === NONE) {
          throw new Error("Sélectionner l'expédition d'origine");
        }
        const hasReceived = varianceLines.some(
          (l) => Number(l.received_grams) > 0 || Number(l.received_units) > 0
        );
        if (!hasReceived) throw new Error("Saisir les quantités reçues");
      }

      // --- Create the event ---
      const completedAt = new Date(`${receivedDate}T12:00:00`).toISOString();
      const { data: event, error: eErr } = await supabase
        .from("events")
        .insert({
          event_number: eventNumber.trim(),
          event_type: "reception",
          reception_kind: kind,
          supplier: supplier.trim() || null,
          reference_number: reference.trim() || null,
          linked_shipment_event_id:
            kind === "transformation_return" && linkedShipmentId !== NONE
              ? linkedShipmentId
              : null,
          related_batch_id: relatedBatchId,
          status: "completed",
          completed_at: completedAt,
          notes: notes.trim() || null,
          created_by: userId,
        } as never)
        .select()
        .single();
      if (eErr) throw eErr;

      // --- Kind-specific post-processing (event_items / non_cannabis) ---
      if (kind === "cannabis_bulk" || kind === "cannabis_batch") {
        if (inventoryLotForBulk) {
          const { error: iErr } = await supabase.from("event_items").insert({
            event_id: event.id,
            inventory_lot_id: inventoryLotForBulk,
            direction: "in",
            quantity_grams: effGrams,
            units: effUnits,
          } as never);
          if (iErr) throw iErr;

          if (useCartons) {
            for (const { carton, bags } of expandCartons(cartons)) {
              if (bags.length === 0) continue;
              const { data: ct, error: cErr } = await supabase
                .from("stock_cartons")
                .insert({
                  lot_id: inventoryLotForBulk,
                  event_id: event.id,
                  carton_code: carton.code.trim() || "CARTON",
                  location: carton.location.trim() || null,
                  created_by: userId,
                } as never)
                .select()
                .single();
              if (cErr) throw cErr;
              const { error: bErr2 } = await supabase.from("stock_containers").insert(
                bags.map((b) => ({
                  lot_id: inventoryLotForBulk,
                  carton_id: ct.id,
                  container_code: b.container_code,
                  container_type: b.container_type,
                  unit_count: b.unit_count,
                  unit_weight_grams: b.unit_weight_grams,
                  net_weight_grams: b.net_weight_grams,
                  gross_weight_grams: b.gross_weight_grams,
                  location: b.location ?? location.trim() ?? null,
                  status: "available",
                  created_by: userId,
                })) as never,
              );
              if (bErr2) throw bErr2;
            }
          }
        }
      } else if (kind === "non_cannabis") {
        const rows = items
          .filter((i) => i.item_name.trim())
          .map((i) => ({
            event_id: event.id,
            item_name: i.item_name.trim(),
            category: i.category.trim() || null,
            quantity: i.quantity ? Number(i.quantity) : null,
            unit: i.unit.trim() || null,
            location: i.location.trim() || null,
            notes: i.notes.trim() || null,
          }));
        const { error: nErr } = await supabase
          .from("non_cannabis_receptions")
          .insert(rows as never);
        if (nErr) throw nErr;
      } else if (kind === "transformation_return") {
        const eiRows = varianceLines
          .filter(
            (l) => Number(l.received_grams) > 0 || Number(l.received_units) > 0
          )
          .map((l) => ({
            event_id: event.id,
            inventory_lot_id: l.inventory_lot_id,
            direction: "in" as const,
            quantity_grams: Number(l.received_grams) || 0,
            units: Number(l.received_units) || 0,
          }));
        if (eiRows.length) {
          const { error: rErr } = await supabase.from("event_items").insert(eiRows as never);
          if (rErr) throw rErr;
        }
      }

      toast.success("Réception créée");
      navigate({ to: "/events/$id", params: { id: event.id } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/events">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour aux événements
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nouvelle réception</CardTitle>
          <CardDescription>
            Enregistre l'arrivée de marchandise (cannabis ou non-cannabis) et
            ajuste automatiquement le stock lié.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {/* Common fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Type de réception *</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECEPTION_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Numéro d'événement *</Label>
              <Input
                value={eventNumber}
                onChange={(e) => setEventNumber(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Date de réception</Label>
              <Input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Fournisseur / producteur</Label>
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="ex: Nuance, Producteur X"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Référence (bordereau, PO, manifest...)</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>

          {/* --- Kind-specific sections --- */}

          {kind === "cannabis_bulk" && (
            <div className="grid gap-4 border-t pt-4">
              <p className="text-sm font-medium">Détails cannabis bulk</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Batch liée (optionnel)</Label>
                  <Select
                    value={existingBatchId}
                    onValueChange={(v) => {
                      setExistingBatchId(v);
                      setExistingLotIdBulk(NONE);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Aucune</SelectItem>
                      {batches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.batch_number}
                          {b.strain ? ` — ${b.strain}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Lot existant (ou nouveau)</Label>
                  <Select value={existingLotIdBulk} onValueChange={setExistingLotIdBulk}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Créer un nouveau lot</SelectItem>
                      {batchLots.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.lot_number} — {l.quantity_grams ?? 0} g
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {existingLotIdBulk === NONE && (
                  <>
                    <div className="grid gap-2">
                      <Label>Type de produit</Label>
                      <Select value={productType} onValueChange={setProductType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRODUCT_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Format</Label>
                      <Input value={format} onChange={(e) => setFormat(e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Taille</Label>
                      <Select value={flowerSize} onValueChange={setFlowerSize}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>—</SelectItem>
                          {FLOWER_SIZES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Emplacement</Label>
                      <Input
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                      />
                    </div>
                  </>
                )}
                {!structured && (
                  <>
                    <div className="grid gap-2">
                      <Label>Quantité reçue (g) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={grams}
                        onChange={(e) => setGrams(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Unités reçues</Label>
                      <Input
                        type="number"
                        min="0"
                        value={units}
                        onChange={(e) => setUnits(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
              <StructuredToggle
                structured={structured}
                onToggle={setStructured}
                cartons={cartons}
                onCartonsChange={setCartons}
                defaultType={productType === "preroll" ? "preroll" : "bulk"}
              />
            </div>
          )}

          {kind === "cannabis_batch" && (
            <div className="grid gap-4 border-t pt-4">
              <p className="text-sm font-medium">Nouvelle batch cannabis</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Numéro de batch *</Label>
                  <Input
                    value={newBatchNumber}
                    onChange={(e) => setNewBatchNumber(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Variété *</Label>
                  <Input
                    value={newBatchStrain}
                    onChange={(e) => setNewBatchStrain(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Numéro de lot</Label>
                  <Input
                    value={newBatchLotNumber}
                    onChange={(e) => setNewBatchLotNumber(e.target.value)}
                    placeholder="Par défaut = numéro batch"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Type de produit</Label>
                  <Select value={productType} onValueChange={setProductType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Format</Label>
                  <Input value={format} onChange={(e) => setFormat(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Emplacement</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} />
                </div>
                {!structured && (
                  <>
                    <div className="grid gap-2">
                      <Label>Quantité (g) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={grams}
                        onChange={(e) => setGrams(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Unités</Label>
                      <Input
                        type="number"
                        min="0"
                        value={units}
                        onChange={(e) => setUnits(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
              <StructuredToggle
                structured={structured}
                onToggle={setStructured}
                cartons={cartons}
                onCartonsChange={setCartons}
                defaultType={productType === "preroll" ? "preroll" : "bulk"}
              />
            </div>
          )}

          {kind === "non_cannabis" && (
            <div className="grid gap-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Articles non-cannabis</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setItems((prev) => [
                      ...prev,
                      { item_name: "", category: "", quantity: "", unit: "", location: "", notes: "" },
                    ])
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> Ajouter
                </Button>
              </div>
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-6"
                >
                  <div className="sm:col-span-2 grid gap-1">
                    <Label className="text-xs">Nom *</Label>
                    <Input
                      value={it.item_name}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, item_name: e.target.value } : p))
                        )
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Catégorie</Label>
                    <Input
                      value={it.category}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, category: e.target.value } : p))
                        )
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Qté</Label>
                    <Input
                      type="number"
                      value={it.quantity}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, quantity: e.target.value } : p))
                        )
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Unité</Label>
                    <Input
                      value={it.unit}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, unit: e.target.value } : p))
                        )
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Emplacement</Label>
                    <Input
                      value={it.location}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, location: e.target.value } : p))
                        )
                      }
                    />
                  </div>
                  <div className="sm:col-span-5 grid gap-1">
                    <Label className="text-xs">Notes</Label>
                    <Input
                      value={it.notes}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, notes: e.target.value } : p))
                        )
                      }
                    />
                  </div>
                  <div className="flex items-end justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setItems((prev) => prev.filter((_, i) => i !== idx))
                      }
                      disabled={items.length <= 1}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {kind === "transformation_return" && (
            <div className="grid gap-4 border-t pt-4">
              <p className="text-sm font-medium">Retour de transformation</p>
              <div className="grid gap-2">
                <Label>Expédition d'origine *</Label>
                <Select value={linkedShipmentId} onValueChange={setLinkedShipmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une expédition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {shipmentEvents.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.event_number} — {new Date(e.created_at).toLocaleDateString("fr-CA")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {varianceLines.length > 0 && (
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2">Lot</th>
                        <th className="text-right px-3 py-2">Envoyé (g)</th>
                        <th className="text-right px-3 py-2">Reçu (g)</th>
                        <th className="text-right px-3 py-2">Envoyé (u)</th>
                        <th className="text-right px-3 py-2">Reçu (u)</th>
                        <th className="text-right px-3 py-2">Écart (g)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {varianceLines.map((l, idx) => {
                        const lot = shipmentLots[l.inventory_lot_id];
                        const recG = Number(l.received_grams) || 0;
                        const diff = recG - l.sent_grams;
                        return (
                          <tr key={l.inventory_lot_id} className="border-t border-border">
                            <td className="px-3 py-2">{lot?.lot_number ?? "—"}</td>
                            <td className="px-3 py-2 text-right">{l.sent_grams}</td>
                            <td className="px-3 py-2 text-right">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className="h-8 w-24 text-right ml-auto"
                                value={l.received_grams}
                                onChange={(e) =>
                                  setVarianceLines((prev) =>
                                    prev.map((p, i) =>
                                      i === idx ? { ...p, received_grams: e.target.value } : p
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="px-3 py-2 text-right">{l.sent_units}</td>
                            <td className="px-3 py-2 text-right">
                              <Input
                                type="number"
                                min="0"
                                className="h-8 w-24 text-right ml-auto"
                                value={l.received_units}
                                onChange={(e) =>
                                  setVarianceLines((prev) =>
                                    prev.map((p, i) =>
                                      i === idx ? { ...p, received_units: e.target.value } : p
                                    )
                                  )
                                }
                              />
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-medium ${
                                diff < 0 ? "text-amber-500" : diff > 0 ? "text-emerald-500" : ""
                              }`}
                            >
                              {recG === 0 ? "—" : diff.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t border-border bg-muted/30 font-medium">
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2 text-right">{totalSent.g.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{totalReceived.g.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{totalSent.u}</td>
                        <td className="px-3 py-2 text-right">{totalReceived.u}</td>
                        <td className="px-3 py-2 text-right">
                          {(totalReceived.g - totalSent.g).toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-2 border-t pt-4">
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => navigate({ to: "/events" })}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Créer la réception
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Toggle between a simple total-weight entry and structured carton/bag entry. */
function StructuredToggle({
  structured,
  onToggle,
  cartons,
  onCartonsChange,
  defaultType,
}: {
  structured: boolean;
  onToggle: (v: boolean) => void;
  cartons: CartonDraft[];
  onCartonsChange: (next: CartonDraft[]) => void;
  defaultType?: string;
}) {
  const totals = cartonTotals(cartons);
  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Saisie par cartons / sacs</p>
          <p className="text-xs text-muted-foreground">
            Recommandé pour les pré-roulés et réceptions multi-cartons : chaque sac devient
            une unité de stock traçable.
          </p>
        </div>
        <Switch checked={structured} onCheckedChange={onToggle} />
      </div>
      {structured && (
        <>
          <CartonBuilder
            cartons={cartons}
            onChange={onCartonsChange}
            defaultType={defaultType}
          />
          <p className="text-sm tabular-nums">
            Total : <strong>{totals.bags}</strong> sac(s) ·{" "}
            <strong>{totals.units}</strong> unité(s) ·{" "}
            <strong>{totals.grams.toFixed(2)} g</strong>
          </p>
        </>
      )}
    </div>
  );
}
