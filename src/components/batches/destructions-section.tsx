import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { DestructionFormDialog } from "./destruction-form-dialog";
import { STAGE_LABELS, type StageCode } from "@/lib/batch-workflow";

type DestructionRow = {
  id: string;
  batch_id: string;
  stage_id: string | null;
  stage_code: string | null;
  weight_grams: number;
  person_count: number | null;
  sanitation_products: string | null;
  duration_minutes: number | null;
  comments: string | null;
  photos: string[];
  created_at: string;
};

export function DestructionsSection({
  batchId,
  refreshKey,
}: {
  batchId: string;
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<DestructionRow[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data, error } = await (supabase as any)
      .from("destructions")
      .select("*")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows(data ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, refreshKey]);

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("destructions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Destruction supprimée");
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Destructions</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Ajouter
        </Button>
      </CardHeader>
      <CardContent>
        {rows === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune destruction enregistrée.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Étape</TableHead>
                <TableHead>Poids (g)</TableHead>
                <TableHead>Personnes</TableHead>
                <TableHead>Temps (min)</TableHead>
                <TableHead>Produits</TableHead>
                <TableHead>Commentaires</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString("fr-CA")}
                  </TableCell>
                  <TableCell>
                    {r.stage_code
                      ? STAGE_LABELS[r.stage_code as StageCode] ?? r.stage_code
                      : "—"}
                  </TableCell>
                  <TableCell>{r.weight_grams}</TableCell>
                  <TableCell>{r.person_count ?? "—"}</TableCell>
                  <TableCell>{r.duration_minutes ?? "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.sanitation_products ?? "—"}</TableCell>
                  <TableCell className="max-w-[240px] truncate">{r.comments ?? "—"}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <DestructionFormDialog
        open={open}
        onOpenChange={setOpen}
        batchId={batchId}
        onSaved={load}
      />
    </Card>
  );
}
