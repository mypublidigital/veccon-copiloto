import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
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

  const adminClient = createAdminClient();

  const { data: conversations, error } = await adminClient
    .from("conversations")
    .select(
      `
      id,
      title,
      created_at,
      updated_at,
      profiles!user_id (
        email,
        name
      ),
      messages (count)
    `
    )
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const formatted = (conversations ?? []).map((c: Record<string, unknown>) => {
    const profile = c.profiles as Record<string, string> | null;
    const messages = c.messages as { count: number }[] | null;
    return {
      id: c.id,
      title: c.title,
      created_at: c.created_at,
      updated_at: c.updated_at,
      user_email: profile?.email ?? "",
      user_name: profile?.name ?? null,
      message_count: messages?.[0]?.count ?? 0,
    };
  });

  return NextResponse.json({ conversations: formatted });
}
