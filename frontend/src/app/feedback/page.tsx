"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { Feedback, FeedbackCategory } from "@/lib/types";

const CAT_META: Record<FeedbackCategory, { icon: string; label: string; color: string }> = {
  bug:         { icon: "🐛", label: "Bug Report",  color: "bg-red-500/15 border-red-500/30 text-red-300" },
  enhancement: { icon: "✨", label: "Enhancement", color: "bg-blue-500/15 border-blue-500/30 text-blue-300" },
  general:     { icon: "💬", label: "General",     color: "bg-white/10 border-white/20 text-white/60" },
  testimonial: { icon: "⭐", label: "Testimonial", color: "bg-yellow-400/15 border-yellow-400/30 text-yellow-300" },
};

const FILTERS: { value: FeedbackCategory | "all"; label: string; icon: string }[] = [
  { value: "all",         icon: "🗂️", label: "All" },
  { value: "bug",         icon: "🐛", label: "Bug" },
  { value: "enhancement", icon: "✨", label: "Enhancement" },
  { value: "general",     icon: "💬", label: "General" },
  { value: "testimonial", icon: "⭐", label: "Testimonial" },
];

export default function FeedbackPage() {
  const [items, setItems]   = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedbackCategory | "all">("all");

  useEffect(() => {
    supabase
      .from("feedback")
      .select(`
        *,
        admin_replies (id, reply, created_at, status)
      `)
      .eq("status", 1)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setItems((data as Feedback[]) ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = filter === "all"
    ? items
    : items.filter((i) => i.category === filter);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/5 bg-[#12121e]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-white/40 hover:text-white transition-colors text-sm">
            ← RedahLuhh
          </Link>
          <span className="text-white/20">·</span>
          <h1 className="font-bold text-white">Community Feedback</h1>
          <span className="ml-auto text-xs text-white/30">{items.length} total</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Intro */}
        <div className="rounded-2xl bg-brand-500/10 border border-brand-500/30 p-4">
          <p className="text-sm text-white/70 leading-relaxed">
            Semua feedback kat sini dibaca oleh developer RedahLuhh. Hantar feedback guna butang{" "}
            <span className="text-brand-400 font-semibold">💬 Feedback</span> kat bawah kanan screen tu.
          </p>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => {
            const count = f.value === "all"
              ? items.length
              : items.filter((i) => i.category === f.value).length;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={clsx(
                  "flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all",
                  filter === f.value
                    ? "bg-brand-500/20 border-brand-500/50 text-brand-400"
                    : "bg-white/5 border-white/10 text-white/40 hover:border-white/20 hover:text-white/60"
                )}
              >
                <span>{f.icon}</span>
                {f.label}
                <span className="opacity-50">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-white/5 ring-1 ring-white/8 p-5 animate-pulse h-28" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-white/30">
            <p className="text-4xl mb-3">🫙</p>
            <p className="text-sm">
              {filter === "all" ? "Belum ada feedback lagi. Jadi yang pertama!" : `Takde feedback untuk kategori ni lagi.`}
            </p>
          </div>
        )}

        {/* Feedback cards */}
        {filtered.map((item) => {
          const meta = CAT_META[item.category];
          const activeReplies = (item.admin_replies ?? []).filter((r) => r.status === 1);
          return (
            <div
              key={item.id}
              className="rounded-2xl bg-[#12121e] ring-1 ring-white/8 p-5 space-y-3 animate-fade-in"
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <span className={clsx("text-[11px] font-semibold px-2.5 py-1 rounded-full border", meta.color)}>
                  {meta.icon} {meta.label}
                </span>
                <span className="text-[11px] text-white/25 flex-shrink-0">
                  {format(new Date(item.created_at), "d MMM yyyy · HH:mm")}
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-white/85 leading-relaxed">{item.description}</p>

              {/* Suggested fix */}
              {item.suggested_fix && (
                <div className="bg-white/5 rounded-xl px-3.5 py-3 border-l-2 border-brand-500/50">
                  <p className="text-[11px] text-white/30 font-semibold uppercase tracking-widest mb-1">
                    Suggested Fix
                  </p>
                  <p className="text-sm text-white/70">{item.suggested_fix}</p>
                </div>
              )}

              {/* Dev replies */}
              {activeReplies.length > 0 && (
                <div className="space-y-2 pt-1">
                  {activeReplies
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                    .map((reply) => (
                      <div key={reply.id} className="flex gap-3">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-sm">
                          🏍️
                        </div>
                        <div className="flex-1 bg-brand-500/10 border border-brand-500/20 rounded-xl px-3.5 py-2.5">
                          <p className="text-[10px] text-brand-400 font-semibold uppercase tracking-widest mb-1">
                            RedahLuhh Dev
                          </p>
                          <p className="text-sm text-white/80 leading-relaxed">{reply.reply}</p>
                          <p className="text-[10px] text-white/25 mt-1.5">
                            {format(new Date(reply.created_at), "d MMM · HH:mm")}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}
