import { Badge } from "@/components/ui/badge";

/** Provinces / sociétés d'État desservies, avec code couleur officiel interne. */
export const PROVINCE_VARIANTS: Record<string, { label: string; className: string }> = {
  SQDC: {
    label: "SQDC",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  },
  OCS: {
    label: "OCS",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  },
  MB: {
    label: "MB",
    className: "bg-red-500/15 text-red-300 border-red-500/40",
  },
  NB: {
    label: "NB",
    className: "bg-red-500/15 text-red-300 border-red-500/40",
  },
};

export function provinceClass(province: string | null | undefined) {
  return (
    PROVINCE_VARIANTS[province ?? ""]?.className ??
    "bg-muted text-muted-foreground border-border"
  );
}

/** Badge province réutilisable (liste rouleaux, fiche, mouvements, timbres apposés). */
export function ProvinceBadge({
  province,
  className,
}: {
  province: string | null | undefined;
  className?: string;
}) {
  if (!province) return <span className="text-muted-foreground">—</span>;
  const v = PROVINCE_VARIANTS[province];
  return (
    <Badge variant="outline" className={`${provinceClass(province)} ${className ?? ""}`}>
      {v?.label ?? province}
    </Badge>
  );
}
