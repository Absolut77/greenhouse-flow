import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { AutoNumberButton } from "@/lib/auto-number";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { Tables } from "@/integrations/supabase/types";
import { PRODUCT_TYPES, FLOWER_SIZES } from "./inventory";

type Batch = Tables<"batches">;

const NONE = "__none__";

export const Route = createFileRoute("/_authenticated/inventory_/new")({
  head: () => ({ meta: [{ title: "Nouveau lot — ONO Cannabis" }] }),
  component: NewLotPage,
});

function NewLotPage() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [lotNumber, setLotNumber] = useState("");
  const [batchId, setBatchId] = useState<string>(NONE);
  const [productType, setProductType] = useState<string>("");
  const [format, setFormat] = useState("");
  const [flowerSize, setFlowerSize] = useState<string>(NONE);
  const [quantity, setQuantity] = useState("");
  const [units, setUnits] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("available");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("batches")
        .select("*")
        .order("created_at", { ascending: false });
      setBatches(data ?? []);
    })();
  }, []);

  const submit = async () => {
    if (!lotNumber.trim()) {
      toast.error("Le numéro de lot est obligatoire");
      return;
    }
    const q = Number(quantity);
    if (!quantity || Number.isNaN(q) || q <= 0) {
      toast.error("La quantité doit être supérieure à 0");
      return;
    }
    let u: number | null = null;
    if (units.trim()) {
      const n = Number(units);
      if (Number.isNaN(n) || n < 0) {
        toast.error("Nombre d'unités invalide");
        return;
      }
      u = n;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("inventory_lots")
      .insert({
        lot_number: lotNumber.trim(),
        batch_id: batchId === NONE ? null : batchId,
        product_type: productType || null,
        format: format.trim() || null,
        flower_size: flowerSize === NONE ? null : flowerSize,
        quantity_grams: q,
        units: u,
        location: location.trim() || null,
        status,
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Ce numéro de lot existe déjà");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Lot créé");
    navigate({ to: "/inventory/$id", params: { id: data.id } });
  };

  return (
    <div className="max-w-2xl space-y-6">
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
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Numéro de lot *</Label>
            <div className="flex gap-2">
              <Input
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="LOT-2026-0001"
              />
              <AutoNumberButton kind="lot" onGenerated={setLotNumber} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Batch liée</Label>
              <Select value={batchId} onValueChange={setBatchId}>
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
              <Label>Type de produit</Label>
              <Select value={productType} onValueChange={setProductType}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
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
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Format</Label>
              <Input
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                placeholder="ex: 3.5g, 14g, Bulk..."
              />
            </div>
            <div className="grid gap-2">
              <Label>Taille de fleur</Label>
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
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Quantité (g) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
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
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Emplacement</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="ex: Vault A, Zone B2..."
              />
            </div>
            <div className="grid gap-2">
              <Label>Statut</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponible</SelectItem>
                  <SelectItem value="reserved">Réservé</SelectItem>
                  <SelectItem value="shipped">Expédié</SelectItem>
                  <SelectItem value="destroyed">Détruit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
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
