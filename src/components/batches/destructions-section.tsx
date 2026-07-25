import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2, FileText, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  sanitation_type: string | null;
  sanitation_products: string | null;
  duration_minutes: number | null;
  comments: string | null;
  photos: string[];
  is_sanitation_log: boolean;
  created_at: string;
};

const stageLabelOf = (code: string | null) =>
  code ? STAGE_LABELS[code as StageCode] ?? code : "Hors étape";

function TypePill({ type }: { type: string | null }) {
  if (!type) return <span className="text-muted-foreground">—</span>;
  const cls =
    type === "full"
      ? "bg-rose-500/20 text-rose-400 border-transparent"
      : "bg-sky-500/20 text-sky-400 border-transparent";
  return <Badge variant="outline" className={cls}>{type === "full" ? "Full" : "Soft"}</Badge>;
}

export function DestructionsSection({
  batchId,
  batchStatus,
  refreshKey,
}: {
  batchId: string;
  batchStatus?: string | null;
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<DestructionRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
    toast.success("Entrée supprimée");
    load();
  };

  const grouped = useMemo(() => {
    const map = new Map<string, DestructionRow[]>();
    (rows ?? []).forEach((r) => {
      const key = r.stage_code ?? "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).map(([key, list]) => ({
      key,
      label: key === "__none__" ? "Hors étape" : stageLabelOf(key),
      list,
      totalDestruction: list.filter((l) => !l.is_sanitation_log).reduce((s, l) => s + Number(l.weight_grams || 0), 0),
      countDestruction: list.filter((l) => !l.is_sanitation_log).length,
      countSanitation: list.filter((l) => l.is_sanitation_log).length,
    }));
  }, [rows]);

  const totalDestruction = grouped.reduce((s, g) => s + g.totalDestruction, 0);
  const canGenerateReport = batchStatus === "closed";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          Destructions & Sanitation
          {rows && (
            <span className="text-sm font-normal text-muted-foreground">
              — {totalDestruction.toFixed(2)} g au total
            </span>
          )}
        </CardTitle>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReportOpen(true)}
            disabled={!canGenerateReport || !rows || rows.length === 0}
            title={!canGenerateReport ? "Disponible une fois la batch fermée" : undefined}
          >
            <FileText className="mr-1 h-4 w-4" /> Rapport final
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Ajouter
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
          </div>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune entrée enregistrée.</p>
        ) : (
          grouped.map((g) => {
            const isOpen = expanded[g.key] ?? true;
            return (
              <div key={g.key} className="rounded-lg border">
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [g.key]: !isOpen }))}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-medium">{g.label}</span>
                    {g.countDestruction > 0 && (
                      <Badge variant="outline" className="border-transparent bg-rose-500/15 text-rose-400">
                        {g.countDestruction} destr. — {g.totalDestruction.toFixed(2)} g
                      </Badge>
                    )}
                    {g.countSanitation > 0 && (
                      <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-400">
                        <Sparkles className="mr-1 h-3 w-3" /> {g.countSanitation} sanit.
                      </Badge>
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Nature</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Poids (g)</TableHead>
                          <TableHead>Pers.</TableHead>
                          <TableHead>Temps</TableHead>
                          <TableHead>Produits</TableHead>
                          <TableHead>Commentaires</TableHead>
                          <TableHead>Photos</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {g.list.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="whitespace-nowrap">
                              {new Date(r.created_at).toLocaleDateString("fr-CA")}
                            </TableCell>
                            <TableCell>
                              {r.is_sanitation_log ? (
                                <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-400">
                                  Sanitation
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-transparent bg-rose-500/15 text-rose-400">
                                  Destruction
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell><TypePill type={r.sanitation_type} /></TableCell>
                            <TableCell>{r.is_sanitation_log ? "—" : r.weight_grams}</TableCell>
                            <TableCell>{r.person_count ?? "—"}</TableCell>
                            <TableCell>{r.duration_minutes ? `${r.duration_minutes} min` : "—"}</TableCell>
                            <TableCell className="max-w-[180px] truncate">{r.sanitation_products ?? "—"}</TableCell>
                            <TableCell className="max-w-[220px] truncate">{r.comments ?? "—"}</TableCell>
                            <TableCell>
                              {r.photos && r.photos.length > 0 ? (
                                <div className="flex gap-1">
                                  {r.photos.slice(0, 3).map((p, i) => (
                                    <a key={i} href={p} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                                      #{i + 1}
                                    </a>
                                  ))}
                                  {r.photos.length > 3 && <span className="text-xs">+{r.photos.length - 3}</span>}
                                </div>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>

      <DestructionFormDialog
        open={open}
        onOpenChange={setOpen}
        batchId={batchId}
        onSaved={load}
      />

      <FinalReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        groups={grouped}
        total={totalDestruction}
      />
    </Card>
  );
}

function FinalReportDialog({
  open,
  onOpenChange,
  groups,
  total,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  groups: {
    key: string;
    label: string;
    list: DestructionRow[];
    totalDestruction: number;
    countDestruction: number;
    countSanitation: number;
  }[];
  total: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Rapport final de destruction</DialogTitle>
          <DialogDescription>Détail des poids détruits par étape.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border p-3">
            <div className="text-xs uppercase text-muted-foreground">Total détruit</div>
            <div className="text-2xl font-semibold">{total.toFixed(2)} g</div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Étape</TableHead>
                <TableHead className="text-right">Nb destructions</TableHead>
                <TableHead className="text-right">Poids (g)</TableHead>
                <TableHead className="text-right">Logs sanitation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.key}>
                  <TableCell>{g.label}</TableCell>
                  <TableCell className="text-right">{g.countDestruction}</TableCell>
                  <TableCell className="text-right">{g.totalDestruction.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{g.countSanitation}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">
                  {groups.reduce((s, g) => s + g.countDestruction, 0)}
                </TableCell>
                <TableCell className="text-right">{total.toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  {groups.reduce((s, g) => s + g.countSanitation, 0)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
