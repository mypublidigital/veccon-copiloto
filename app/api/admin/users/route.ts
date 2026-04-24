import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function checkAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return profile?.role === "admin" ? user : null;
}

// GET /api/admin/users — list all users
export async function GET() {
  const admin = await checkAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const adminClient = createAdminClient();
  const { data: profiles, error } = await adminClient
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: profiles });
}

// POST /api/admin/users — create user
export async function POST(req: NextRequest) {
  const admin = await checkAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { name, email, password, role, department } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "E-mail e senha são obrigatórios." }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Create auth user
  const { data: authUser, error: authError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Create profile
  const { error: profileError } = await adminClient.from("profiles").insert({
    id: authUser.user.id,
    email,
    name: name || null,
    role: role || "user",
    department: department || null,
  });

  if (profileError) {
    // Cleanup auth user if profile creation fails
    await adminClient.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Log action
  await adminClient.from("access_logs").insert({
    user_id: admin.id,
    action: "admin_create_user",
    metadata: { created_user_email: email },
  });

  return NextResponse.json({ success: true });
}

// DELETE /api/admin/users?id=xxx — delete user
export async function DELETE(req: NextRequest) {
  const admin = await checkAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("id");

  if (!userId) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const adminClient = createAdminClient();

  // Delete profile first (cascade will handle conversations/messages)
  await adminClient.from("profiles").delete().eq("id", userId);

  // Delete auth user
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await adminClient.from("access_logs").insert({
    user_id: admin.id,
    action: "admin_delete_user",
    metadata: { deleted_user_id: userId },
  });

  return NextResponse.json({ success: true });
}
