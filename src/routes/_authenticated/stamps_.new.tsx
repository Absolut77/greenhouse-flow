import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
import { PROVINCES } from "./stamps";

export const Route = createFileRoute("/_authenticated/stamps_/new")({
  head: () => ({ meta: [{ title: "Nouveau rouleau — ONO Cannabis" }] }),
  component: NewReelPage,
});

function NewReelPage() {
  const navigate = useNavigate();
  const [serial, setSerial] = useState("");
  const [province, setProvince] = useState<string>("SQDC");
  const [boxId, setBoxId] = useState("");
  const [original, setOriginal] = useState("5000");
  const [spoiled, setSpoiled] = useState("0");
  const [receivedAt, setReceivedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!serial.trim()) {
      toast.error("Le numéro de série est obligatoire");
      return;
    }
    const o = Number(original);
    if (!original || Number.isNaN(o) || o <= 0) {
      toast.error("Quantité originale invalide");
      return;
    }
    const s = Number(spoiled);
    if (Number.isNaN(s) || s < 0) {
      toast.error("Spoiled invalide");
      return;
    }
    if (s > o) {
      toast.error("Spoiled ne peut pas dépasser la quantité originale");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("excise_reels")
      .insert({
        serial_number: serial.trim(),
        province,
        box_id: boxId.trim() || null,
        original_quantity: o,
        spoiled_at_reception: s,
        received_at: receivedAt || null,
        status: "available",
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Ce numéro de série existe déjà");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Rouleau créé");
    navigate({ to: "/stamps/$id", params: { id: data.id } });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/stamps">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour aux rouleaux
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nouveau rouleau</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Numéro de série *</Label>
            <Input value={serial} onChange={(e) => setSerial(e.target.value)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Province *</Label>
              <Select value={province} onValueChange={setProvince}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVINCES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Box ID</Label>
              <Input value={boxId} onChange={(e) => setBoxId(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Quantité originale *</Label>
              <Input
                type="number"
                min="1"
                value={original}
                onChange={(e) => setOriginal(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Spoiled à la réception</Label>
              <Input
                type="number"
                min="0"
                value={spoiled}
                onChange={(e) => setSpoiled(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Date de réception</Label>
            <Input
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" asChild>
              <Link to="/stamps">Annuler</Link>
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Créer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
