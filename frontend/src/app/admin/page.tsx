"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { Feedback, AdminReply, FeedbackCategory } from "@/lib/types";

const CAT_META: Record<FeedbackCategory, { icon: string; label: string }> = {
  bug:         { icon: "🐛", label: "Bug" },
  enhancement: { icon: "✨", label: "Enhancement" },
  general:     { icon: "💬", label: "General" },
  testimonial: { icon: "⭐", label: "Testimonial" },
};

// ── Login screen ───────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      try { localStorage.setItem("isAdmin", "true"); } catch {}
      onLogin();
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">🏍️</span>
          <h1 className="text-xl font-bold text-white mt-3">RedahLuhh Admin</h1>
          <p className="text-sm text-white/30 mt-1">Developer access only</p>
        </div>
        <form onSubmit={handleLogin} className="bg-[#12121e] rounded-2xl ring-1 ring-white/10 p-6 space-y-4">
          <div>
            <label className="text-xs text-white/40 font-semibold uppercase tracking-widest block mb-2">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-brand-500/60 transition-all"
              placeholder="your@email.com"
            />
          </div>
          <div>
            <label className="text-xs text-white/40 font-semibold uppercase tracking-widest block mb-2">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-brand-500/60 transition-all"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold text-sm py-3 rounded-xl transition-all"
          >
            {loading ? "Logging in…" : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Analytics section ──────────────────────────────────────────────────────

interface AnalyticsData {
  totalSearches:  number;
  totalPageViews: number;
  days: { date: string; searches: number; pageViews: number }[];
}

function AnalyticsSection() {
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    async function load() {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: rows } = await supabase
        .from("analytics_events")
        .select("event, created_at")
        .gte("created_at", sevenDaysAgo);

      if (!rows) return;

      const totalSearches  = rows.filter((r) => r.event === "search").length;
      const totalPageViews = rows.filter((r) => r.event === "page_view").length;

      // Build last-7-days array
      const days: AnalyticsData["days"] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const dateStr = d.toISOString().split("T")[0];
        const dayRows = rows.filter((r) => r.created_at.startsWith(dateStr));
        days.push({
          date:     dateStr,
          searches: dayRows.filter((r) => r.event === "search").length,
          pageViews: dayRows.filter((r) => r.event === "page_view").length,
        });
      }

      setData({ totalSearches, totalPageViews, days });
    }
    load();
  }, []);

  if (!data) {
    return (
      <div className="bg-[#12121e] rounded-2xl ring-1 ring-white/8 p-5 animate-pulse h-32" />
    );
  }

  const maxSearches  = Math.max(...data.days.map((d) => d.searches), 1);
  const maxPageViews = Math.max(...data.days.map((d) => d.pageViews), 1);

  return (
    <div className="bg-[#12121e] rounded-2xl ring-1 ring-white/8 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">Analytics — last 7 days</h2>
        <span className="text-[10px] text-white/20">Excluding your own visits</span>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-white">{data.totalSearches}</p>
          <p className="text-[11px] text-white/40 mt-0.5">Searches</p>
        </div>
        <div className="bg-white/5 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-white">{data.totalPageViews}</p>
          <p className="text-[11px] text-white/40 mt-0.5">Page Views</p>
        </div>
      </div>

      {/* Daily bar chart */}
      <div>
        <p className="text-[10px] text-white/25 mb-2 flex gap-4">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-brand-500/70 inline-block" />Searches</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-white/20 inline-block" />Page Views</span>
        </p>
        <div className="flex items-end gap-1.5 h-16">
          {data.days.map((day) => (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex items-end gap-0.5 h-12">
                <div
                  className="flex-1 bg-brand-500/70 rounded-t-sm min-h-[2px] transition-all"
                  style={{ height: `${(day.searches / maxSearches) * 100}%` }}
                  title={`${day.searches} searches`}
                />
                <div
                  className="flex-1 bg-white/20 rounded-t-sm min-h-[2px] transition-all"
                  style={{ height: `${(day.pageViews / maxPageViews) * 100}%` }}
                  title={`${day.pageViews} views`}
                />
              </div>
              <span className="text-[9px] text-white/20">
                {new Date(day.date + "T00:00:00").toLocaleDateString("en-MY", { weekday: "narrow" })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Admin dashboard ────────────────────────────────────────────────────────

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [items, setItems]       = useState<Feedback[]>([]);
  const [loading, setLoading]   = useState(true);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyLoading, setReplyLoading] = useState<Record<string, boolean>>({});
  const [filter, setFilter]     = useState<"all" | "active" | "hidden">("active");

  async function fetchAll() {
    const { data } = await supabase
      .from("feedback")
      .select("*, admin_replies(id, reply, status, created_at)")
      .order("created_at", { ascending: false });
    setItems((data as Feedback[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  async function toggleStatus(id: string, current: number) {
    await supabase.from("feedback").update({ status: current === 1 ? 0 : 1 }).eq("id", id);
    fetchAll();
  }

  async function submitReply(feedbackId: string) {
    const text = replyText[feedbackId]?.trim();
    if (!text) return;
    setReplyLoading((p) => ({ ...p, [feedbackId]: true }));
    await supabase.from("admin_replies").insert({ feedback_id: feedbackId, reply: text });
    setReplyText((p) => ({ ...p, [feedbackId]: "" }));
    setReplyLoading((p) => ({ ...p, [feedbackId]: false }));
    fetchAll();
  }

  async function deleteReply(replyId: string) {
    await supabase.from("admin_replies").update({ status: 0 }).eq("id", replyId);
    fetchAll();
  }

  const filtered = items.filter((i) => {
    if (filter === "active") return i.status === 1;
    if (filter === "hidden") return i.status === 0;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/5 bg-[#12121e]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-xl">🏍️</span>
          <span className="font-bold text-white">Admin</span>
          <span className="ml-auto text-xs text-white/30">{items.length} total</span>
          <button
            onClick={onLogout}
            className="text-xs text-white/30 hover:text-white/60 transition-colors ml-3"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* ── Analytics ── */}
        <AnalyticsSection />

        {/* Filter tabs */}
        <div className="flex gap-2 pt-2">
          {(["active", "hidden", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                "text-xs font-semibold px-3 py-1.5 rounded-full border transition-all capitalize",
                filter === f
                  ? "bg-brand-500/20 border-brand-500/50 text-brand-400"
                  : "bg-white/5 border-white/10 text-white/40 hover:border-white/20"
              )}
            >
              {f} {f === "active" ? `(${items.filter(i => i.status === 1).length})` : f === "hidden" ? `(${items.filter(i => i.status === 0).length})` : `(${items.length})`}
            </button>
          ))}
        </div>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-white/5 ring-1 ring-white/8 p-5 animate-pulse h-32" />
            ))}
          </div>
        )}

        {filtered.map((item) => {
          const meta = CAT_META[item.category];
          const activeReplies = (item.admin_replies ?? []).filter(r => r.status === 1);
          return (
            <div
              key={item.id}
              className={clsx(
                "rounded-2xl ring-1 p-5 space-y-4",
                item.status === 0
                  ? "bg-white/3 ring-white/5 opacity-60"
                  : "bg-[#12121e] ring-white/8"
              )}
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-base">{meta.icon}</span>
                  <span className="text-xs font-semibold text-white/50">{meta.label}</span>
                  {item.status === 0 && (
                    <span className="text-[10px] bg-white/10 text-white/30 px-2 py-0.5 rounded-full">Hidden</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-white/25">
                    {format(new Date(item.created_at), "d MMM yyyy · HH:mm")}
                  </span>
                  <button
                    onClick={() => toggleStatus(item.id, item.status)}
                    className={clsx(
                      "text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all",
                      item.status === 1
                        ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                        : "border-green-500/30 text-green-400 hover:bg-green-500/10"
                    )}
                  >
                    {item.status === 1 ? "Hide" : "Restore"}
                  </button>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-white/80 leading-relaxed">{item.description}</p>

              {/* Suggested fix */}
              {item.suggested_fix && (
                <div className="bg-white/5 rounded-xl px-3.5 py-2.5 border-l-2 border-brand-500/50">
                  <p className="text-[10px] text-white/30 font-semibold uppercase tracking-widest mb-1">Suggested Fix</p>
                  <p className="text-sm text-white/65">{item.suggested_fix}</p>
                </div>
              )}

              {/* Existing replies */}
              {activeReplies.length > 0 && (
                <div className="space-y-2">
                  {activeReplies
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                    .map((reply) => (
                      <div key={reply.id} className="flex gap-2 items-start">
                        <div className="flex-1 bg-brand-500/10 border border-brand-500/20 rounded-xl px-3.5 py-2.5">
                          <p className="text-sm text-white/80">{reply.reply}</p>
                          <p className="text-[10px] text-white/25 mt-1">
                            {format(new Date(reply.created_at), "d MMM · HH:mm")}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteReply(reply.id)}
                          className="text-[10px] text-white/20 hover:text-red-400 transition-colors mt-2"
                          title="Delete reply"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                </div>
              )}

              {/* Reply input */}
              <div className="flex gap-2">
                <textarea
                  value={replyText[item.id] ?? ""}
                  onChange={(e) => setReplyText((p) => ({ ...p, [item.id]: e.target.value }))}
                  rows={2}
                  placeholder="Reply as developer…"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-brand-500/60 transition-all"
                />
                <button
                  onClick={() => submitReply(item.id)}
                  disabled={replyLoading[item.id] || !replyText[item.id]?.trim()}
                  className="flex-shrink-0 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm font-semibold px-4 rounded-xl transition-all self-end pb-2.5 pt-2.5"
                >
                  {replyLoading[item.id] ? "…" : "Reply"}
                </button>
              </div>
            </div>
          );
        })}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-white/30">
            <p className="text-3xl mb-2">🫙</p>
            <p className="text-sm">Takde feedback lagi.</p>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Root page ──────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
    });
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    try { localStorage.removeItem("isAdmin"); } catch {}
    setAuthed(false);
  }

  if (authed === null) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <span className="text-white/30 text-sm">Checking session…</span>
      </div>
    );
  }

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;
  return <Dashboard onLogout={handleLogout} />;
}
