import type { Tables } from "@/integrations/supabase/types";

export type Stage = Tables<"batch_stages">;

export type StageCode =
  | "drying"
  | "debudding_manual"
  | "mobius"
  | "sanitation"
  | "sorting_weighing"
  | "curing"
  | "bulk_packaging";

export type StageStatus = "locked" | "available" | "in_progress" | "on_hold" | "done";

export type WorkflowStep = {
  code: StageCode;
  label: string;
  description?: string;
  status: StageStatus;
  row: Stage | null;
  askDestruction: boolean;
  independent?: boolean;
};

export const STAGE_LABELS: Record<StageCode, string> = {
  drying: "Séchage",
  debudding_manual: "Debudage manuel",
  mobius: "Mobius",
  sanitation: "Sanitation",
  sorting_weighing: "Tri & Pesée principale",
  curing: "Curing",
  bulk_packaging: "Bulk Packaging",
};

const ASK_DESTRUCTION_ON_END: StageCode[] = [
  "drying",
  "debudding_manual",
  "mobius",
  "sorting_weighing",
];

// Legacy mapping: rows saved before the workflow are treated as their new code.
const LEGACY_MAP: Record<string, StageCode> = {
  debudding: "debudding_manual",
  weighing: "sorting_weighing",
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
  if (s === "done" || s === "in_progress" || s === "on_hold" || s === "locked") {
    return s as StageStatus;
  }
  // Legacy row without status column filled
  if (row.ended_at) return "done";
  if (row.started_at) return "in_progress";
  return null;
}

export function computeWorkflow(stages: Stage[]): WorkflowStep[] {
  const get = (code: StageCode) => findStage(stages, code);

  const drying = get("drying");
  const manual = get("debudding_manual");
  const mobius = get("mobius");
  const sanitation = get("sanitation");
  const sorting = get("sorting_weighing");
  const curing = get("curing");
  const bulk = get("bulk_packaging");

  const isDone = (c: StageCode) => rowStatus(get(c)) === "done";

  const stepFor = (
    code: StageCode,
    row: Stage | null,
    unlocked: boolean,
  ): WorkflowStep => {
    const rs = rowStatus(row);
    let status: StageStatus;
    if (rs === "done") status = "done";
    else if (rs === "in_progress") status = "in_progress";
    else if (rs === "on_hold") status = "on_hold";
    else status = unlocked ? "available" : "locked";
    return {
      code,
      label: STAGE_LABELS[code],
      status,
      row,
      askDestruction: ASK_DESTRUCTION_ON_END.includes(code),
    };
  };

  const dryingStep = stepFor("drying", drying, true);
  const debuddingUnlocked = isDone("drying");
  const manualStep = stepFor("debudding_manual", manual, debuddingUnlocked);
  const mobiusStep = stepFor("mobius", mobius, debuddingUnlocked);
  const sortingUnlocked = isDone("debudding_manual") && isDone("mobius");
  const sortingStep = stepFor("sorting_weighing", sorting, sortingUnlocked);
  const curingUnlocked = isDone("sorting_weighing");
  const curingStep = stepFor("curing", curing, curingUnlocked);
  const bulkUnlocked = isDone("curing");
  const bulkStep = stepFor("bulk_packaging", bulk, bulkUnlocked);
  const sanitationStep: WorkflowStep = {
    ...stepFor("sanitation", sanitation, true),
    independent: true,
    askDestruction: false,
  };

  return [dryingStep, manualStep, mobiusStep, sanitationStep, sortingStep, curingStep, bulkStep];
}
