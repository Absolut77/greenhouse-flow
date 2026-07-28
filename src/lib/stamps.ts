import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Reel = Tables<"excise_reels">;
export type StampMovement = Tables<"stamp_movements">;

/** Balance restante d'un rouleau à partir de ses mouvements. */
export function reelBalance(
  reel: Pick<Reel, "original_quantity" | "spoiled_at_reception">,
  movements: Pick<StampMovement, "movement_type" | "quantity">[],
) {
  let used = 0;
  let destroyed = 0;
  let returned = 0;
  for (const m of movements) {
    const q = m.quantity ?? 0;
    if (m.movement_type === "used") used += q;
    else if (m.movement_type === "destroyed") destroyed += q;
    else if (m.movement_type === "returned") returned += q;
  }
  return {
    used,
    destroyed,
    returned,
    balance:
      (reel.original_quantity ?? 0) -
      (reel.spoiled_at_reception ?? 0) -
      used -
      destroyed +
      returned,
  };
}

export type ReelWithBalance = Reel & { balance: number };

/** Rouleaux utilisables (non épuisés) avec leur balance calculée. */
export async function fetchAvailableReels(): Promise<ReelWithBalance[]> {
  const { data: reels, error } = await supabase
    .from("excise_reels")
    .select("*")
    .neq("status", "depleted")
    .order("received_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  const rows = (reels ?? []) as Reel[];
  if (rows.length === 0) return [];
  const { data: mvts } = await supabase
    .from("stamp_movements")
    .select("reel_id, movement_type, quantity")
    .in(
      "reel_id",
      rows.map((r) => r.id),
    );
  const byReel: Record<string, { movement_type: string | null; quantity: number | null }[]> = {};
  (mvts ?? []).forEach((m: any) => {
    (byReel[m.reel_id] ??= []).push(m);
  });
  return rows
    .map((r) => ({ ...r, balance: reelBalance(r, byReel[r.id] ?? []).balance }))
    .filter((r) => r.balance > 0);
}

/** Nombre de timbres déjà apposés sur un lot (used − returned). */
export async function fetchLotStampCount(lotId: string) {
  const { data, error } = await supabase
    .from("stamp_movements")
    .select("movement_type, quantity")
    .eq("lot_id", lotId);
  if (error) throw error;
  let n = 0;
  (data ?? []).forEach((m: any) => {
    if (m.movement_type === "used") n += m.quantity ?? 0;
    if (m.movement_type === "returned") n -= m.quantity ?? 0;
  });
  return n;
}

/** Crée le mouvement `used` liant un rouleau à un lot Mastercase. */
export async function applyStampsToLot(opts: {
  reelId: string;
  lotId: string;
  quantity: number;
  eventId?: string | null;
  comments?: string | null;
}) {
  const { error } = await supabase.from("stamp_movements").insert({
    reel_id: opts.reelId,
    lot_id: opts.lotId,
    event_id: opts.eventId ?? null,
    movement_type: "used",
    quantity: Math.round(opts.quantity),
    comments: opts.comments ?? null,
  } as never);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Reporting : timbres apposés                                         */
/* ------------------------------------------------------------------ */

export type AppliedBucket = "standby" | "shipped" | "returned";

export type AppliedRow = {
  id: string;
  bucket: AppliedBucket;
  quantity: number;
  moved_at: string;
  reel_serial: string;
  province: string | null;
  lot_id: string;
  lot_number: string;
  lot_kind: string | null;
  lot_status: string | null;
};

/** Lots encore physiquement en inventaire. */
const IN_STOCK_STATUSES = ["available", "reserved", "standby"];

/**
 * Regroupe les mouvements de timbres rattachés à un lot :
 * - standby  : timbres apposés sur des lots encore en inventaire
 * - shipped  : timbres sur des lots sortis (expédiés / détruits)
 * - returned : mouvements de retour
 */
export async function fetchAppliedStamps(): Promise<AppliedRow[]> {
  const { data: mvts, error } = await supabase
    .from("stamp_movements")
    .select("*")
    .not("lot_id", "is", null)
    .order("moved_at", { ascending: false });
  if (error) throw error;
  const list = (mvts ?? []) as StampMovement[];
  if (list.length === 0) return [];

  const lotIds = Array.from(new Set(list.map((m) => m.lot_id).filter(Boolean) as string[]));
  const reelIds = Array.from(new Set(list.map((m) => m.reel_id)));

  const [{ data: lots }, { data: reels }] = await Promise.all([
    supabase.from("inventory_lots").select("id, lot_number, lot_kind, status").in("id", lotIds),
    supabase.from("excise_reels").select("id, serial_number, province").in("id", reelIds),
  ]);
  const lotMap: Record<string, any> = {};
  (lots ?? []).forEach((l: any) => (lotMap[l.id] = l));
  const reelMap: Record<string, any> = {};
  (reels ?? []).forEach((r: any) => (reelMap[r.id] = r));

  return list.map((m) => {
    const lot = lotMap[m.lot_id as string];
    const bucket: AppliedBucket =
      m.movement_type === "returned"
        ? "returned"
        : IN_STOCK_STATUSES.includes(lot?.status ?? "")
          ? "standby"
          : "shipped";
    return {
      id: m.id,
      bucket,
      quantity: m.quantity ?? 0,
      moved_at: m.moved_at,
      reel_serial: reelMap[m.reel_id]?.serial_number ?? "—",
      province: reelMap[m.reel_id]?.province ?? null,
      lot_id: m.lot_id as string,
      lot_number: lot?.lot_number ?? "—",
      lot_kind: lot?.lot_kind ?? null,
      lot_status: lot?.status ?? null,
    };
  });
}

/** Clé de mois "YYYY-MM" dans le fuseau de l'usine. */
export function monthKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const mo = parts.find((p) => p.type === "month")?.value ?? "";
  return `${y}-${mo}`;
}
