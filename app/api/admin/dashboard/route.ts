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
  const today = new Date().toISOString().slice(0, 10);

  const [
    { count: totalUsers },
    { count: totalConversations },
    { count: totalMessages },
    { count: activeToday },
    { data: convsByDept },
    { data: recentActivity },
  ] = await Promise.all([
    adminClient.from("profiles").select("*", { count: "exact", head: true }),
    adminClient.from("conversations").select("*", { count: "exact", head: true }),
    adminClient.from("messages").select("*", { count: "exact", head: true }),
    adminClient
      .from("access_logs")
      .select("*", { count: "exact", head: true })
      .eq("action", "chat_message")
      .gte("created_at", `${today}T00:00:00`),
    // Conversations by department: join via profiles
    adminClient
      .from("conversations")
      .select("profiles!user_id(department)")
      .limit(1000),
    // Activity last 7 days
    adminClient
      .from("conversations")
      .select("created_at")
      .gte(
        "created_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      ),
  ]);

  // Aggregate by department
  const deptMap: Record<string, number> = {};
  for (const row of convsByDept ?? []) {
    const profileData = row.profiles as unknown as Record<string, string> | null;
    const dept = profileData?.department ?? "Não definido";
    deptMap[dept] = (deptMap[dept] ?? 0) + 1;
  }
  const byDepartment = Object.entries(deptMap)
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count);

  // Aggregate by date (last 7 days)
  const dateMap: Record<string, number> = {};
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  last7.forEach((d) => (dateMap[d] = 0));
  for (const row of recentActivity ?? []) {
    const d = (row.created_at as string).slice(0, 10);
    if (d in dateMap) dateMap[d]++;
  }
  const recentActivityFormatted = last7.map((date) => ({
    date,
    count: dateMap[date] ?? 0,
  }));

  return NextResponse.json({
    totalUsers: totalUsers ?? 0,
    totalConversations: totalConversations ?? 0,
    totalMessages: totalMessages ?? 0,
    activeToday: activeToday ?? 0,
    byDepartment,
    recentActivity: recentActivityFormatted,
  });
}
