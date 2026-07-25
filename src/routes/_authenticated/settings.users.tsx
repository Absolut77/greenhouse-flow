import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, RefreshCw, ShieldAlert } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import {
  listAdminUsers,
  updateUserRole,
  setUserActive,
  sendPasswordResetForUser,
  type AdminUserRow,
} from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/settings/users")({
  head: () => ({ meta: [{ title: "Utilisateurs — ONO Cannabis" }] }),
  component: UsersPage,
});

const ROLES = ["admin", "supervisor", "operator", "viewer"] as const;

function UsersPage() {
  const { user, roles, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState<AdminUserRow | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);

  const fnList = useServerFn(listAdminUsers);
  const fnRole = useServerFn(updateUserRole);
  const fnActive = useServerFn(setUserActive);
  const fnReset = useServerFn(sendPasswordResetForUser);

  const isAdmin = roles.includes("admin");

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      navigate({ to: "/dashboard" });
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdmin]);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await fnList();
      setRows(data);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  const changeRole = async (row: AdminUserRow, role: (typeof ROLES)[number]) => {
    if (row.role === role) return;
    try {
      await fnRole({ data: { userId: row.id, role } });
      toast.success(`Rôle mis à jour : ${role}`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    }
  };

  const toggleActive = async (row: AdminUserRow, active: boolean) => {
    try {
      await fnActive({ data: { userId: row.id, active } });
      toast.success(active ? "Compte activé" : "Compte désactivé");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    }
  };

  const doReset = async () => {
    if (!resetOpen) return;
    try {
      const res = await fnReset({
        data: {
          userId: resetOpen.id,
          redirectTo: `${window.location.origin}/reset-password`,
        },
      });
      setResetLink(res.link);
      toast.success(`Courriel envoyé à ${res.email}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    }
  };

  if (authLoading || !isAdmin) return null;

  const adminCount = (rows ?? []).filter((r) => r.role === "admin").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Utilisateurs & rôles</h1>
          <p className="text-sm text-muted-foreground">
            Gestion des comptes, rôles et activation. Le dernier administrateur ne peut pas être retiré.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Rafraîchir
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Comptes ({rows?.length ?? 0}) · {adminCount} admin{adminCount > 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !rows ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Courriel</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Actif</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows ?? []).map((row) => {
                  const isSelf = row.id === user?.id;
                  const isLastAdmin = row.role === "admin" && adminCount <= 1;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {row.initials ?? "??"}
                          </div>
                          <div>
                            <div className="font-medium">
                              {row.full_name ?? "—"}
                              {isSelf && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  Vous
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.email}</TableCell>
                      <TableCell>
                        <Select
                          value={row.role ?? "viewer"}
                          onValueChange={(v) => changeRole(row, v as (typeof ROLES)[number])}
                          disabled={isLastAdmin}
                        >
                          <SelectTrigger className="h-8 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isLastAdmin && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-500">
                            <ShieldAlert className="h-3 w-3" /> Dernier admin
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.is_active}
                          onCheckedChange={(v) => toggleActive(row, v)}
                          disabled={isSelf}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setResetLink(null);
                            setResetOpen(row);
                          }}
                        >
                          <KeyRound className="mr-2 h-4 w-4" />
                          Réinitialiser
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      Aucun utilisateur.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!resetOpen}
        onOpenChange={(o) => {
          if (!o) {
            setResetOpen(null);
            setResetLink(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Réinitialiser le mot de passe</AlertDialogTitle>
            <AlertDialogDescription>
              Un courriel de récupération sera envoyé à <b>{resetOpen?.email}</b>. Vous pourrez aussi copier le lien
              généré et le transmettre manuellement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {resetLink && (
            <div className="rounded-md border bg-muted p-2 text-xs break-all">{resetLink}</div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Fermer</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void doReset(); }}>
              Envoyer le lien
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
