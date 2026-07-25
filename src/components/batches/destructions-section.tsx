import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2, FileText, ChevronDown, ChevronRight, Sparkles, Skull } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PhotoThumbs } from "@/components/batches/photo-uploader";
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
import { STAGE_LABELS, STAGE_ORDER, isFreshStage, type StageCode } from "@/lib/batch-workflow";

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

const stageOrderIdx = (code: string | null) => {
  if (!code) return 999;
  const i = STAGE_ORDER.indexOf(code as StageCode);
  return i === -1 ? 998 : i;
};

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
  const [destructionOpen, setDestructionOpen] = useState(false);
  const [sanitationOpen, setSanitationOpen] = useState(false);
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

  const destructions = (rows ?? []).filter((r) => !r.is_sanitation_log);
  const sanitations = (rows ?? []).filter((r) => r.is_sanitation_log);

  const destructionGroups = useMemo(() => groupByStage(destructions), [destructions]);
  const sanitationGroups = useMemo(() => groupByStage(sanitations), [sanitations]);

  const totalDestruction = destructions.reduce((s, l) => s + Number(l.weight_grams || 0), 0);
  const canGenerateReport = batchStatus === "closed";

  return (
    <div className="space-y-6">
      {/* DESTRUCTIONS */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Skull className="h-4 w-4 text-rose-400" />
            Destructions
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
              disabled={!canGenerateReport || destructions.length === 0}
              title={!canGenerateReport ? "Disponible une fois la batch fermée" : undefined}
            >
              <FileText className="mr-1 h-4 w-4" /> Rapport final
            </Button>
            <Button size="sm" onClick={() => setDestructionOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Ajouter une destruction
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows === null ? (
            <Loading />
          ) : destructionGroups.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Aucune destruction enregistrée.</p>
          ) : (
            destructionGroups.map((g) => (
              <GroupBlock
                key={g.key}
                group={g}
                expanded={expanded[g.key] ?? true}
                onToggle={() => setExpanded((e) => ({ ...e, [g.key]: !(e[g.key] ?? true) }))}
                onRemove={remove}
                showFreshBadge
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* SANITATIONS */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            Sanitations
            {rows && (
              <span className="text-sm font-normal text-muted-foreground">
                — {sanitations.length} log(s)
              </span>
            )}
          </CardTitle>
          <Button size="sm" onClick={() => setSanitationOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Ajouter une sanitation
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows === null ? (
            <Loading />
          ) : sanitationGroups.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Aucun log de sanitation.</p>
          ) : (
            sanitationGroups.map((g) => (
              <GroupBlock
                key={g.key}
                group={g}
                expanded={expanded[`san-${g.key}`] ?? true}
                onToggle={() => setExpanded((e) => ({ ...e, [`san-${g.key}`]: !(e[`san-${g.key}`] ?? true) }))}
                onRemove={remove}
                isSanitation
              />
            ))
          )}
        </CardContent>
      </Card>

      <DestructionFormDialog
        open={destructionOpen}
        onOpenChange={setDestructionOpen}
        batchId={batchId}
        onSaved={load}
      />

      <DestructionFormDialog
        open={sanitationOpen}
        onOpenChange={setSanitationOpen}
        batchId={batchId}
        onSaved={load}
        mode="sanitation"
      />

      <FinalReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        groups={destructionGroups}
        total={totalDestruction}
      />
    </div>
  );
}

type Group = {
  key: string;
  label: string;
  list: DestructionRow[];
  total: number;
  count: number;
};

function groupByStage(list: DestructionRow[]): Group[] {
  const map = new Map<string, DestructionRow[]>();
  list.forEach((r) => {
    const key = r.stage_code ?? "__none__";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  });
  const groups = Array.from(map.entries()).map(([key, arr]) => ({
    key,
    label: key === "__none__" ? "Hors étape" : stageLabelOf(key),
    list: arr,
    total: arr.reduce((s, l) => s + Number(l.weight_grams || 0), 0),
    count: arr.length,
  }));
  groups.sort((a, b) => stageOrderIdx(a.key === "__none__" ? null : a.key) - stageOrderIdx(b.key === "__none__" ? null : b.key));
  return groups;
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
    </div>
  );
}

function GroupBlock({
  group,
  expanded,
  onToggle,
  onRemove,
  isSanitation,
  showFreshBadge,
}: {
  group: Group;
  expanded: boolean;
  onToggle: () => void;
  onRemove: (id: string) => void;
  isSanitation?: boolean;
  showFreshBadge?: boolean;
}) {
  const fresh = isFreshStage(group.key === "__none__" ? null : group.key);
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/40"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-medium">{group.label}</span>
          {showFreshBadge && (
            <Badge variant="outline" className={fresh ? "border-transparent bg-sky-500/15 text-sky-400" : "border-transparent bg-amber-500/15 text-amber-400"}>
              {fresh ? "Fresh" : "Dried cannabis"}
            </Badge>
          )}
          {!isSanitation ? (
            <Badge variant="outline" className="border-transparent bg-rose-500/15 text-rose-400">
              {group.count} × {group.total.toFixed(2)} g
            </Badge>
          ) : (
            <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-400">
              {group.count} log(s)
            </Badge>
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                {!isSanitation && <TableHead>Poids (g)</TableHead>}
                {isSanitation && <TableHead>Type</TableHead>}
                {isSanitation && <TableHead>Salle / Produits</TableHead>}
                <TableHead>Pers.</TableHead>
                <TableHead>Temps</TableHead>
                {!isSanitation && <TableHead>Produits</TableHead>}
                <TableHead>Commentaires</TableHead>
                <TableHead>Photos</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.list.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString("fr-CA")}
                  </TableCell>
                  {!isSanitation && <TableCell>{r.weight_grams}</TableCell>}
                  {isSanitation && <TableCell><TypePill type={r.sanitation_type} /></TableCell>}
                  {isSanitation && <TableCell className="max-w-[220px] truncate">{r.sanitation_products ?? "—"}</TableCell>}
                  <TableCell>{r.person_count ?? "—"}</TableCell>
                  <TableCell>{r.duration_minutes ? `${r.duration_minutes} min` : "—"}</TableCell>
                  {!isSanitation && <TableCell className="max-w-[180px] truncate">{r.sanitation_products ?? "—"}</TableCell>}
                  <TableCell className="max-w-[220px] truncate">{r.comments ?? "—"}</TableCell>
                  <TableCell>
                    <PhotoThumbs paths={r.photos ?? []} />
                  </TableCell>

                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => onRemove(r.id)}>
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
}

function FinalReportDialog({
  open,
  onOpenChange,
  groups,
  total,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  groups: Group[];
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
                <TableHead>Nature</TableHead>
                <TableHead className="text-right">Nb</TableHead>
                <TableHead className="text-right">Poids (g)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.key}>
                  <TableCell>{g.label}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={isFreshStage(g.key === "__none__" ? null : g.key) ? "border-transparent bg-sky-500/15 text-sky-400" : "border-transparent bg-amber-500/15 text-amber-400"}>
                      {isFreshStage(g.key === "__none__" ? null : g.key) ? "Fresh" : "Dried cannabis"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{g.count}</TableCell>
                  <TableCell className="text-right">{g.total.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                <TableCell />
                <TableCell className="text-right">{groups.reduce((s, g) => s + g.count, 0)}</TableCell>
                <TableCell className="text-right">{total.toFixed(2)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
