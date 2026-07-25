import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  initials: string | null;
  is_active: boolean;
  created_at: string;
  role: "admin" | "supervisor" | "operator" | "viewer" | null;
};

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, initials, is_active, created_at")
      .order("created_at", { ascending: true });
    if (pErr) throw new Error(pErr.message);
    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rErr) throw new Error(rErr.message);
    const roleMap = new Map<string, AdminUserRow["role"]>();
    (roles ?? []).forEach((r: any) => roleMap.set(r.user_id, r.role));
    return (profiles ?? []).map((p: any) => ({
      ...p,
      role: roleMap.get(p.id) ?? null,
    }));
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: "admin" | "supervisor" | "operator" | "viewer" }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { userId, role } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Safeguard: prevent self-demotion when last admin
    if (userId === context.userId && role !== "admin") {
      const { data: count } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin");
      // count is in response headers, but supabase-js returns via count field in response
      const { count: adminCount } = await supabaseAdmin
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");
      if ((adminCount ?? 0) <= 1) {
        throw new Error("Vous ne pouvez pas retirer votre propre rôle admin — c'est le dernier.");
      }
      void count;
    }
    // Delete existing roles for the user, insert the new one (single-role model)
    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (delErr) throw new Error(delErr.message);
    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role });
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; active: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    if (data.userId === context.userId && !data.active) {
      throw new Error("Vous ne pouvez pas désactiver votre propre compte.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.active })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    // Also revoke the auth session if deactivating
    if (!data.active) {
      await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "876000h" });
    } else {
      await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "none" });
    }
    return { ok: true };
  });

export const sendPasswordResetForUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; redirectTo: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user, error: uErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (uErr || !user?.user?.email) throw new Error(uErr?.message || "Utilisateur introuvable");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: user.user.email,
      options: { redirectTo: data.redirectTo },
    });
    if (error) throw new Error(error.message);
    return { link: link?.properties?.action_link ?? null, email: user.user.email };
  });
