"use client";

import { format } from "date-fns";
import clsx from "clsx";
import { RouteWeatherResponse, Waypoint, WeatherStatus } from "@/lib/types";
import { WeatherCard } from "./WeatherCard";

// ── Banner colours keyed by worst status ──────────────────────────────────
const BANNER: Record<WeatherStatus, { border: string; bg: string; text: string }> = {
  green:  { border: "border-green-500/30",  bg: "bg-green-500/8",  text: "text-green-400" },
  yellow: { border: "border-yellow-400/40", bg: "bg-yellow-400/8", text: "text-yellow-300" },
  red:    { border: "border-red-500/50",    bg: "bg-red-500/8",    text: "text-red-300" },
};

interface WeatherSummaryProps {
  data: RouteWeatherResponse;
  onRefresh: () => void;
  refreshing: boolean;
}

export function WeatherSummary({ data, onRefresh, refreshing }: WeatherSummaryProps) {
  const { overall_status: status, waypoints, route, summary, alerts, met_warnings, last_updated, departure_time } = data;
  const banner = BANNER[status];

  // Find the worst waypoint to feature in the banner
  const worstWp = [...waypoints].sort((a, b) => {
    const rank = { red: 2, yellow: 1, green: 0 };
    return rank[b.weather.status] - rank[a.weather.status];
  })[0];

  return (
    <div className="animate-slide-up space-y-4">

      {/* ── MET Malaysia official warnings ──────────────────────────────── */}
      {met_warnings && met_warnings.length > 0 && (
        <div className="rounded-2xl border border-orange-500/50 bg-orange-500/10 p-3.5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">🚨</span>
            <p className="text-xs font-bold text-orange-300 uppercase tracking-widest">
              MET Malaysia Official Warning
            </p>
          </div>
          {met_warnings.map((w, i) => (
            <p key={i} className="text-sm text-orange-100/80 leading-snug">{w}</p>
          ))}
        </div>
      )}

      {/* ── Conditions banner ───────────────────────────────────────────── */}
      <div className={clsx("rounded-2xl border p-4 flex items-center gap-4", banner.border, banner.bg)}>
        <span className="text-4xl leading-none flex-shrink-0">
          {worstWp.weather.icon_code || "🌡️"}
        </span>
        <div className="min-w-0">
          <p className={clsx("text-xl font-bold truncate", banner.text)}>
            {worstWp.weather.description}
          </p>
          <p className="text-sm text-white/60 mt-0.5">{summary}</p>
          {alerts.map((a, i) => (
            <p key={i} className="text-xs text-white/40 mt-1">{a}</p>
          ))}
        </div>
      </div>

      {/* ── Route stats ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard icon="📍" label="Distance" value={`${route.total_distance_km} km`} />
        <StatCard icon="⏱️" label="Duration"  value={fmtDuration(route.total_duration_minutes)} />
        <StatCard icon="🕐" label="Depart"    value={format(new Date(departure_time), "HH:mm")} />
      </div>

      {/* ── Condition strip ─────────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-2.5">
          Conditions along route
        </p>
        {/* Visual timeline */}
        <div className="flex items-center gap-0 mb-3 overflow-x-auto pb-1">
          {waypoints.map((wp, i) => (
            <TimelinePoint key={wp.index} waypoint={wp} isLast={i === waypoints.length - 1} />
          ))}
        </div>
        {/* Scrollable cards */}
        <div className="flex gap-3 overflow-x-auto pt-1 pb-2 scrollbar-thin">
          {waypoints.map((wp) => (
            <WeatherCard key={wp.index} waypoint={wp} />
          ))}
        </div>
      </div>

      {/* ── Refresh ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-xs text-white/25">
        <span>Updated {format(new Date(last_updated), "HH:mm:ss")} · WeatherAPI + MET Malaysia</span>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors disabled:opacity-40"
        >
          <span className={clsx(refreshing && "animate-spin")}>↻</span>
          {refreshing ? "Updating…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}

// ── Timeline dot + connector ───────────────────────────────────────────────
const TIMELINE_DOT: Record<WeatherStatus, string> = {
  green:  "bg-green-400",
  yellow: "bg-yellow-400",
  red:    "bg-red-500",
};

function TimelinePoint({ waypoint, isLast }: { waypoint: Waypoint; isLast: boolean }) {
  return (
    <div className="flex items-center flex-shrink-0">
      <div className="flex flex-col items-center gap-0.5">
        <span
          className={clsx(
            "w-3 h-3 rounded-full ring-2 ring-dark-900",
            TIMELINE_DOT[waypoint.weather.status]
          )}
          title={`${waypoint.label}: ${waypoint.weather.description}`}
        />
        <span className="text-[9px] text-white/30 max-w-[40px] text-center truncate">
          {waypoint.label === "Start" || waypoint.label === "Destination"
            ? waypoint.label
            : waypoint.label}
        </span>
      </div>
      {!isLast && (
        <div className="w-8 h-px bg-white/15 flex-shrink-0 mb-4" />
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded-xl p-3 text-center ring-1 ring-white/8">
      <div className="text-lg mb-1">{icon}</div>
      <p className="text-sm font-bold text-white">{value}</p>
      <p className="text-[11px] text-white/40 mt-0.5">{label}</p>
    </div>
  );
}

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}
