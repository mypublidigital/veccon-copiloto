import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin")
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const { userId, password } = await req.json();

  if (!userId || !password || password.length < 6) {
    return NextResponse.json(
      { error: "ID e senha (mín. 6 chars) são obrigatórios." },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await adminClient.from("access_logs").insert({
    user_id: user.id,
    action: "admin_reset_password",
    metadata: { target_user_id: userId },
  });

  return NextResponse.json({ success: true });
}
