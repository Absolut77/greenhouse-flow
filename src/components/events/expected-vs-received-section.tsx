import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtG } from "@/lib/containers";
import { formatZonedDate } from "@/lib/dates";

type Progress = {
  sentG: number;
  sentU: number;
  recG: number;
  recU: number;
  receptions: { id: string; event_number: string; created_at: string; grams: number; units: number }[];
};

/**
 * Attendu vs reçu pour une expédition externe (transformation Nuance, etc.).
 * Les réceptions partielles rattachées via linked_shipment_event_id sont cumulées.
 */
export function ExpectedVsReceivedSection({ eventId }: { eventId: string }) {
  const [p, setP] = useState<Progress | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: outs }, { data: recs }] = await Promise.all([
        supabase
          .from("event_items")
          .select("quantity_grams,units")
          .eq("event_id", eventId)
          .eq("direction", "out"),
        supabase
          .from("events")
          .select("id,event_number,created_at")
          .eq("linked_shipment_event_id", eventId)
          .order("created_at", { ascending: true }),
      ]);
      const recEvents = recs ?? [];
      let ins: { event_id: string; quantity_grams: number | null; units: number | null }[] = [];
      if (recEvents.length > 0) {
        const { data } = await supabase
          .from("event_items")
          .select("event_id,quantity_grams,units")
          .in(
            "event_id",
            recEvents.map((r) => r.id),
          )
          .eq("direction", "in");
        ins = (data ?? []) as typeof ins;
      }
      if (cancelled) return;
      const sentG = (outs ?? []).reduce((a, o) => a + (Number(o.quantity_grams) || 0), 0);
      const sentU = (outs ?? []).reduce((a, o) => a + (Number(o.units) || 0), 0);
      const receptions = recEvents.map((r) => {
        const lines = ins.filter((i) => i.event_id === r.id);
        return {
          id: r.id,
          event_number: r.event_number,
          created_at: r.created_at,
          grams: lines.reduce((a, i) => a + (Number(i.quantity_grams) || 0), 0),
          units: lines.reduce((a, i) => a + (Number(i.units) || 0), 0),
        };
      });
      setP({
        sentG,
        sentU,
        recG: receptions.reduce((a, r) => a + r.grams, 0),
        recU: receptions.reduce((a, r) => a + r.units, 0),
        receptions,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (p === null) {
    return (
      <Card>
        <CardContent className="py-6">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const restG = p.sentG - p.recG;
  const restU = p.sentU - p.recU;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Attendu vs reçu</CardTitle>
        <CardDescription>
          Suivi des retours de transformation externes — plusieurs réceptions partielles possibles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-md border border-border/60 bg-muted/20 p-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Quantité envoyée</p>
            <p className="font-semibold tabular-nums">
              {fmtG(p.sentG)} g · {p.sentU} u
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Déjà reçu</p>
            <p className="font-semibold tabular-nums">
              {fmtG(p.recG)} g · {p.recU} u
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Reste attendu</p>
            <p
              className={`font-semibold tabular-nums ${
                restG > 0.01 ? "text-amber-500" : "text-emerald-500"
              }`}
            >
              {fmtG(restG)} g · {restU} u
            </p>
          </div>
        </div>

        {p.receptions.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {p.receptions.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4">
                <Link to="/events/$id" params={{ id: r.id }} className="hover:underline">
                  {r.event_number}
                </Link>
                <span className="text-muted-foreground tabular-nums">
                  {formatZonedDate(r.created_at)} · {fmtG(r.grams)} g · {r.units} u
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune réception rattachée pour l'instant.</p>
        )}
      </CardContent>
    </Card>
  );
}
