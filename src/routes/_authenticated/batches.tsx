import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Download } from "lucide-react";
import { exportXlsx, fmtDate, fmtDateTime } from "@/lib/export-xlsx";


import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import type { Tables } from "@/integrations/supabase/types";

type Batch = Tables<"batches">;

export const Route = createFileRoute("/_authenticated/batches")({
  head: () => ({ meta: [{ title: "Batches — ONO Cannabis" }] }),
  component: BatchesPage,
});

const STATUS_VARIANTS: Record<
  string,
  { label: string; className: string }
> = {
  in_progress: {
    label: "En cours",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  closed: {
    label: "Fermée",
    className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  },
  archived: {
    label: "Archivée",
    className: "bg-red-500/15 text-red-400 border-red-500/30",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const v = STATUS_VARIANTS[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={v.className}>
      {v.label}
    </Badge>
  );
}

function BatchesPage() {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isViewerOnly = roles.length > 0 && roles.every((r) => r === "viewer");
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      let query = supabase
        .from("batches")
        .select("*")
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (cancelled) return;
      if (error) setError(error.message);
      else setBatches(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Batches</h1>
          <p className="text-sm text-muted-foreground">
            Gestion des batches de récolte, séchage et transformation.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (!batches) return;
              exportXlsx("batches", [
                {
                  name: "Batches",
                  rows: batches.map((b) => ({
                    Numéro: b.batch_number,
                    Strain: b.strain ?? "",
                    "Nb plants": b.plant_count ?? "",
                    "Poids récolte (g)": b.weight_per_plant ?? "",
                    "Date récolte": fmtDate(b.harvest_date),
                    "Salle récolte": b.harvest_room ?? "",
                    "Séchage": b.drying_location ?? "",
                    Statut: b.status,
                    "Créée le": fmtDateTime(b.created_at),
                    "Fermée le": fmtDateTime(b.closed_at),
                  })),
                },
              ]);
            }}
            disabled={!batches || batches.length === 0}
          >
            <Download className="mr-1 h-4 w-4" />
            Exporter Excel
          </Button>
          {!isViewerOnly && (
            <Button onClick={() => navigate({ to: "/batches/new" })}>
              <Plus className="mr-1 h-4 w-4" />
              Nouvelle Batch
            </Button>
          )}
        </div>

      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Statut</span>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="in_progress">En cours</SelectItem>
            <SelectItem value="closed">Fermée</SelectItem>
            <SelectItem value="archived">Archivée</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Numéro</TableHead>
              <TableHead>Strain</TableHead>
              <TableHead>Date de récolte</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Créée le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error && (
              <TableRow>
                <TableCell colSpan={5} className="text-destructive">
                  {error}
                </TableCell>
              </TableRow>
            )}
            {!error && batches === null && (
              <>
                {[...Array(3)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(5)].map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </>
            )}
            {batches && batches.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground py-8"
                >
                  Aucune batch pour le moment.
                </TableCell>
              </TableRow>
            )}
            {batches?.map((b) => (
              <TableRow
                key={b.id}
                className="cursor-pointer"
                onClick={() =>
                  navigate({ to: "/batches/$id", params: { id: b.id } })
                }
              >
                <TableCell className="font-medium">
                  <Link
                    to="/batches/$id"
                    params={{ id: b.id }}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {b.batch_number}
                  </Link>
                </TableCell>
                <TableCell>{b.strain ?? "—"}</TableCell>
                <TableCell>
                  {b.harvest_date
                    ? new Date(b.harvest_date).toLocaleDateString("fr-CA")
                    : "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={b.status} />
                </TableCell>
                <TableCell>
                  {new Date(b.created_at).toLocaleDateString("fr-CA")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
