import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type NumberKind = "batch" | "event" | "lot" | "reel" | "sample";

export async function fetchNextNumber(kind: NumberKind): Promise<string | null> {
  const { data, error } = await (supabase as any).rpc("next_number", { _kind: kind });
  if (error) {
    toast.error(`Numérotation auto : ${error.message}`);
    return null;
  }
  return data as string;
}

export function AutoNumberButton({
  kind,
  onGenerated,
  label = "Auto",
}: {
  kind: NumberKind;
  onGenerated: (value: string) => void;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const v = await fetchNextNumber(kind);
        setLoading(false);
        if (v) onGenerated(v);
      }}
    >
      {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
      {label}
    </Button>
  );
}
