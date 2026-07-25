import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Réinitialiser le mot de passe — ONO Cannabis" },
      { name: "description", content: "Choisissez un nouveau mot de passe pour votre compte ONO Cannabis." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async () => {
    if (password.length < 8) return toast.error("Mot de passe : 8 caractères minimum.");
    if (password !== confirm) return toast.error("Les mots de passe ne correspondent pas.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Mot de passe mis à jour.");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Nouveau mot de passe</CardTitle>
          <CardDescription>
            {ready
              ? "Choisissez un nouveau mot de passe pour votre compte."
              : "Ouvrez ce lien depuis le courriel de récupération pour continuer."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="pwd">Mot de passe</Label>
            <Input id="pwd" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!ready} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pwd2">Confirmer</Label>
            <Input id="pwd2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={!ready} />
          </div>
          <Button className="w-full" onClick={submit} disabled={!ready || saving}>
            Mettre à jour
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
