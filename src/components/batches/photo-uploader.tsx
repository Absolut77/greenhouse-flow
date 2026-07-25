import { useEffect, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BUCKET = "batch-photos";

function isHttpUrl(v: string) {
  return /^https?:\/\//i.test(v);
}

async function signPaths(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const out: Record<string, string> = {};
  // Old records stored raw URLs — pass them through
  const legacy = paths.filter(isHttpUrl);
  legacy.forEach((p) => (out[p] = p));
  const storagePaths = paths.filter((p) => !isHttpUrl(p));
  if (!storagePaths.length) return out;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(storagePaths, 3600);
  if (error || !data) return out;
  data.forEach((d) => {
    if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  });
  return out;
}

export function PhotoUploader({
  batchId,
  value,
  onChange,
  folder = "destructions",
  disabled,
}: {
  batchId: string;
  value: string[];
  onChange: (paths: string[]) => void;
  folder?: string;
  disabled?: boolean;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let alive = true;
    const missing = value.filter((p) => !urls[p]);
    if (!missing.length) return;
    signPaths(missing).then((map) => {
      if (!alive) return;
      setUrls((u) => ({ ...u, ...map }));
    });
    return () => {
      alive = false;
    };
  }, [value]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${batchId}/${folder}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) {
        toast.error(`Échec upload ${file.name}: ${error.message}`);
      } else {
        uploaded.push(path);
      }
    }
    setUploading(false);
    if (uploaded.length) {
      onChange([...value, ...uploaded]);
      toast.success(`${uploaded.length} photo(s) téléversée(s)`);
    }
  };

  const removeAt = async (idx: number) => {
    const path = value[idx];
    if (path) {
      await supabase.storage.from(BUCKET).remove([path]);
    }
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div className="grid gap-2">
      <div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm hover:bg-muted/50">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span>{uploading ? "Téléversement…" : "Ajouter des photos"}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={disabled || uploading}
            onChange={(e) => {
              handleFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((p, i) => (
            <div key={p} className="group relative aspect-square overflow-hidden rounded border border-border bg-muted/40">
              {urls[p] ? (
                <a href={urls[p]} target="_blank" rel="noreferrer">
                  <img src={urls[p]} alt={`photo-${i + 1}`} className="h-full w-full object-cover" />
                </a>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">…</div>
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute right-1 top-1 rounded-full bg-background/80 p-1 opacity-0 shadow transition group-hover:opacity-100"
                aria-label="Supprimer"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PhotoThumbs({ paths, max = 3 }: { paths: string[]; max?: number }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    if (!paths?.length) return;
    signPaths(paths).then((map) => {
      if (alive) setUrls(map);
    });
    return () => {
      alive = false;
    };
  }, [paths?.join("|")]);

  if (!paths?.length) return <span>—</span>;
  const shown = paths.slice(0, max);
  return (
    <div className="flex items-center gap-1">
      {shown.map((p, i) => (
        <a key={p} href={urls[p] ?? "#"} target="_blank" rel="noreferrer" className="block">
          {urls[p] ? (
            <img src={urls[p]} alt={`p${i + 1}`} className="h-8 w-8 rounded object-cover" />
          ) : (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-muted text-[10px]">…</span>
          )}
        </a>
      ))}
      {paths.length > max && <span className="text-xs text-muted-foreground">+{paths.length - max}</span>}
    </div>
  );
}
