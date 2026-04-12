"use client";

import { useState } from "react";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { FeedbackCategory } from "@/lib/types";

const CATEGORIES: { value: FeedbackCategory; label: string; icon: string; desc: string }[] = [
  { value: "bug",         icon: "🐛", label: "Bug Report",      desc: "Something's broken" },
  { value: "enhancement", icon: "✨", label: "Enhancement",     desc: "Make it better" },
  { value: "general",     icon: "💬", label: "General",         desc: "Anything else" },
  { value: "testimonial", icon: "⭐", label: "Testimonial",     desc: "Share your experience" },
];

type Step = "form" | "success";

export function FeedbackWidget() {
  const [open, setOpen]     = useState(false);
  const [step, setStep]     = useState<Step>("form");
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [description, setDescription] = useState("");
  const [suggestedFix, setSuggestedFix] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  function reset() {
    setStep("form");
    setCategory("general");
    setDescription("");
    setSuggestedFix("");
    setError(null);
  }

  function handleClose() {
    setOpen(false);
    setTimeout(reset, 300);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    if (category === "bug" && !suggestedFix.trim()) return;

    setLoading(true);
    setError(null);

    const { error: err } = await supabase.from("feedback").insert({
      category,
      description: description.trim(),
      suggested_fix: category === "bug" ? suggestedFix.trim() : null,
    });

    setLoading(false);
    if (err) {
      setError("Tak dapat hantar. Cuba lagi.");
    } else {
      setStep("success");
    }
  }

  return (
    <>
      {/* ── Floating button ─────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        className="fixed bottom-6 right-5 z-40 flex items-center gap-2 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg shadow-brand-900/40 transition-all"
      >
        <span>💬</span>
        Feedback
      </button>

      {/* ── Backdrop ────────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <div className="w-full max-w-md bg-[#12121e] rounded-3xl ring-1 ring-white/10 shadow-2xl animate-slide-up overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8">
              <div>
                <p className="font-bold text-white">Send Feedback</p>
                <p className="text-xs text-white/40 mt-0.5">Anonymous · Read by the dev</p>
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center text-white/50 hover:text-white transition-all"
              >
                ✕
              </button>
            </div>

            {step === "success" ? (
              /* Success state */
              <div className="flex flex-col items-center gap-3 py-12 px-5">
                <span className="text-5xl">🙌</span>
                <p className="font-bold text-white text-lg">Terima kasih!</p>
                <p className="text-sm text-white/50 text-center">
                  Feedback kau dah sampai. Nanti developer reply kat{" "}
                  <a href="/feedback" className="text-brand-400 underline underline-offset-2">
                    /feedback
                  </a>
                  .
                </p>
                <button
                  onClick={handleClose}
                  className="mt-4 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm px-6 py-2.5 rounded-full transition-all"
                >
                  Close
                </button>
              </div>
            ) : (
              /* Form */
              <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">

                {/* Category */}
                <div>
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Category</p>
                  <div className="grid grid-cols-2 gap-2">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setCategory(c.value)}
                        className={clsx(
                          "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all",
                          category === c.value
                            ? "bg-brand-500/20 border-brand-500/60 ring-1 ring-brand-500/30"
                            : "bg-white/5 border-white/10 hover:border-white/20"
                        )}
                      >
                        <span className="text-xl">{c.icon}</span>
                        <div>
                          <p className="text-xs font-semibold text-white leading-tight">{c.label}</p>
                          <p className="text-[10px] text-white/40">{c.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-semibold text-white/40 uppercase tracking-widest block mb-2">
                    {category === "bug" ? "Describe the issue" : "Your message"}
                    <span className="text-brand-500 ml-0.5">*</span>
                  </label>
                  <textarea
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder={
                      category === "bug"
                        ? "Apa yang tak kena?"
                        : category === "enhancement"
                        ? "Feature / improvement apa yang nak?"
                        : category === "testimonial"
                        ? "Cerita pengalaman guna RedahLuhh..."
                        : "Apa dalam kepala kau?"
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-3 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/30 transition-all"
                  />
                </div>

                {/* Suggested fix — only for bug */}
                {category === "bug" && (
                  <div className="animate-fade-in">
                    <label className="text-xs font-semibold text-white/40 uppercase tracking-widest block mb-2">
                      Suggested fix
                      <span className="text-brand-500 ml-0.5">*</span>
                    </label>
                    <textarea
                      required
                      value={suggestedFix}
                      onChange={(e) => setSuggestedFix(e.target.value)}
                      rows={2}
                      placeholder="Any idea/suggestion untuk fix?"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-3 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/30 transition-all"
                    />
                  </div>
                )}

                {error && (
                  <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-3 py-2">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold text-sm py-3 rounded-xl transition-all active:scale-[0.98]"
                >
                  {loading ? "Sending…" : "Hantar Feedback"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
