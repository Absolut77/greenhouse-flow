import type { Tables } from "@/integrations/supabase/types";

export type Stage = Tables<"batch_stages">;

export type StageCode = "drying" | "debudding" | "curing" | "bulk_packaging";

export type StageStatus = "locked" | "available" | "in_progress" | "done";

export type WorkflowStep = {
  code: StageCode;
  label: string;
  status: StageStatus;
  row: Stage | null;
};

export const STAGE_LABELS: Record<StageCode, string> = {
  drying: "Séchage",
  debudding: "Debudage",
  curing: "Curing",
  bulk_packaging: "Bulk Packaging",
};

export const STAGE_ORDER: StageCode[] = ["drying", "debudding", "curing", "bulk_packaging"];

const LEGACY_MAP: Record<string, StageCode> = {
  debudding_manual: "debudding",
  mobius: "debudding",
  sorting_weighing: "debudding",
};

export function findStage(stages: Stage[], code: StageCode): Stage | null {
  return (
    stages.find((s) => s.stage_type === code) ??
    stages.find((s) => LEGACY_MAP[s.stage_type ?? ""] === code) ??
    null
  );
}

function rowStatus(row: Stage | null): StageStatus | null {
  if (!row) return null;
  const s = (row as any).status as string | null;
  if (s === "done" || s === "in_progress" || s === "locked") return s as StageStatus;
  if (row.ended_at) return "done";
  if (row.started_at) return "in_progress";
  return null;
}

export function computeWorkflow(stages: Stage[]): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  let previousDone = true;
  for (const code of STAGE_ORDER) {
    const row = findStage(stages, code);
    const rs = rowStatus(row);
    let status: StageStatus;
    if (rs === "done") status = "done";
    else if (rs === "in_progress") status = "in_progress";
    else status = previousDone ? "available" : "locked";
    steps.push({ code, label: STAGE_LABELS[code], status, row });
    previousDone = status === "done";
  }
  return steps;
}

export function formatDuration(fromIso?: string | null, toIso?: string | null): string {
  if (!fromIso) return "—";
  const from = new Date(fromIso).getTime();
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  let ms = Math.max(0, to - from);
  const days = Math.floor(ms / 86400000);
  ms -= days * 86400000;
  const hours = Math.floor(ms / 3600000);
  ms -= hours * 3600000;
  const mins = Math.floor(ms / 60000);
  if (days > 0) return `${days} j, ${hours} h ${mins} min`;
  if (hours > 0) return `${hours} h ${mins} min`;
  return `${mins} min`;
}

export function isFreshStage(code: StageCode | string | null | undefined): boolean {
  // Toutes destructions AVANT bulk_packaging = Fresh destruction
  return code !== "bulk_packaging";
}
