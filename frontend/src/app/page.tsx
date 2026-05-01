"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import clsx from "clsx";

import { RouteForm } from "@/components/RouteForm";
import { WeatherSummary } from "@/components/WeatherSummary";
import { useRouteWeather } from "@/hooks/useRouteWeather";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { MultiRouteWeatherResponse, RouteWeatherResponse, Waypoint } from "@/lib/types";

// WeatherMap uses useMap which must run client-side
const WeatherMap = dynamic(
  () => import("@/components/WeatherMap").then((m) => m.WeatherMap),
  { ssr: false, loading: () => <MapSkeleton /> }
);

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const API_BASE     = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const STATUS_SCORE_BG: Record<string, string> = {
  green:  "bg-green-500/15 border-green-500/30 text-green-300",
  yellow: "bg-yellow-400/15 border-yellow-400/30 text-yellow-300",
  red:    "bg-red-500/15 border-red-500/30 text-red-300",
};

const BACKEND_DOT: Record<string, string> = {
  checking: "bg-yellow-400 animate-pulse",
  online:   "bg-green-400",
  offline:  "bg-red-500",
};

const BACKEND_LABEL: Record<string, string> = {
  checking: "Starting up…",
  online:   "Live",
  offline:  "Offline",
};

const PROVIDER_ICONS: Record<string, string> = {
  "xweather":   "🌩️",
  "meteoblue":  "🔵",
  "tomorrow.io": "⚡",
  "open-meteo": "📡",
  "weatherapi": "🌐",
};

const PROVIDER_LABELS: Record<string, string> = {
  "xweather":   "XWeather",
  "meteoblue":  "Meteoblue",
  "tomorrow.io": "Tomorrow.io",
  "open-meteo": "Open-Meteo",
  "weatherapi": "WeatherAPI",
};

interface ProviderStatus {
  primary: string;
  xweather_exhausted:   boolean;
  meteoblue_exhausted:  boolean;
  tomorrow_exhausted:   boolean;
  open_meteo_exhausted: boolean;
}

interface Toast {
  id: string;
  message: string;
}

export default function HomePage() {
  const { data, selectedRoute, selectedIndex, setSelectedIndex, loading, error, search, refresh } =
    useRouteWeather();
  const [activeTab, setActiveTab] = useState<"map" | "summary">("map");
  const backendStatus = useBackendHealth();

  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [toasts, setToasts]                 = useState<Toast[]>([]);
  const seenExhaustedRef = useRef<Set<string>>(new Set());
  const prevDataRef      = useRef<MultiRouteWeatherResponse | null>(null);

  // Load seen-exhaustion set from sessionStorage after mount
  useEffect(() => {
    try {
      const stored: string[] = JSON.parse(sessionStorage.getItem("rl_seen_exhausted") ?? "[]");
      seenExhaustedRef.current = new Set(stored);
    } catch {}
  }, []);

  // Fetch provider status after each new search result
  useEffect(() => {
    if (!data || data === prevDataRef.current) return;
    prevDataRef.current = data;

    fetch(`${API_BASE}/api/provider-status`)
      .then((r) => r.json())
      .then((status: ProviderStatus) => {
        setProviderStatus(status);

        const allExhausted =
          status.xweather_exhausted &&
          status.meteoblue_exhausted &&
          status.tomorrow_exhausted &&
          status.open_meteo_exhausted;

        if (allExhausted && !seenExhaustedRef.current.has("all")) {
          addToast("all", "⚠️ All free weather API quotas reached for today — resets at midnight MYT. Terima kasih kerana support!");
        } else {
          const checks: [string, boolean, string][] = [
            ["xweather",   status.xweather_exhausted,   "XWeather quota hit — switching to Meteoblue"],
            ["meteoblue",  status.meteoblue_exhausted,  "Meteoblue quota hit — switching to Tomorrow.io"],
            ["tomorrow",   status.tomorrow_exhausted,   "Tomorrow.io quota hit — switching to Open-Meteo"],
            ["open-meteo", status.open_meteo_exhausted, "Switching to WeatherAPI backup"],
          ];
          for (const [key, exhausted, msg] of checks) {
            if (exhausted && !seenExhaustedRef.current.has(key)) {
              addToast(key, msg);
            }
          }
        }
      })
      .catch(() => {});
  }, [data]);

  function addToast(id: string, message: string) {
    seenExhaustedRef.current.add(id);
    try {
      sessionStorage.setItem("rl_seen_exhausted", JSON.stringify([...seenExhaustedRef.current]));
    } catch {}
    setToasts((prev) => {
      if (prev.some((t) => t.id === id)) return prev;
      return [...prev, { id, message }];
    });
    setTimeout(() => dismissToast(id), 10_000);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  const handleSearch = (origin: string, destination: string, departure?: Date) => {
    search({
      origin,
      destination,
      departure_time: departure?.toISOString(),
    });
    setActiveTab("map");
  };

  return (
    <APIProvider apiKey={MAPS_API_KEY} libraries={["places", "marker"]}>
      <div className="min-h-screen flex flex-col">
        {/* ── Header ── */}
        <header className="border-b border-white/5 bg-dark-800/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">🏍️</span>
            <div>
              <h1 className="text-base font-extrabold text-white leading-tight tracking-tight">
                Redah<span className="text-brand-500">Luhh</span>
              </h1>
              <p className="text-[10px] text-white/30 tracking-widest uppercase">
                Redah Tanpa Ragu
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className={clsx("w-1.5 h-1.5 rounded-full", BACKEND_DOT[backendStatus])} />
              <span className="text-xs text-white/30">{BACKEND_LABEL[backendStatus]}</span>
            </div>
          </div>
        </header>

        {/* ── Backend startup snackbar ── */}
        {backendStatus !== "online" && (
          <div
            className={clsx(
              "fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl shadow-xl text-sm text-center animate-fade-in w-[min(90vw,380px)]",
              backendStatus === "checking"
                ? "bg-dark-700 border border-white/10 text-white/70"
                : "bg-red-900/80 border border-red-500/30 text-red-200"
            )}
          >
            {backendStatus === "checking"
              ? "🏍️ Warming up the server… this takes ~30 sec on first load (free hosting)"
              : "Server couldn't be reached. Try refreshing."}
          </div>
        )}

        {/* ── Toast notifications ── */}
        {toasts.length > 0 && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-2 w-[min(90vw,380px)]">
            {toasts.map((t) => (
              <div
                key={t.id}
                className="bg-dark-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/80 shadow-xl flex items-start gap-3 animate-fade-in"
              >
                <span className="flex-1 leading-snug">{t.message}</span>
                <button
                  onClick={() => dismissToast(t.id)}
                  className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0 mt-0.5 text-base leading-none"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Main ── */}
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-5">
          {/* Hero text (only before first search) */}
          {!data && !loading && (
            <div className="text-center py-4 animate-fade-in">
              <p className="text-2xl font-bold text-white leading-snug">
                Know the weather{" "}
                <span className="text-brand-500">along your route</span>
              </p>
              <p className="text-sm text-white/40 mt-2">
                Not just at the destination — every kilometre of it.
              </p>
            </div>
          )}

          {/* Route form */}
          <RouteForm onSearch={handleSearch} loading={loading} />

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300 animate-fade-in">
              <span className="font-semibold">Error: </span>
              {error}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && <ResultSkeleton />}

          {/* Results */}
          {data && selectedRoute && !loading && (
            <div className="animate-slide-up space-y-4">

              {/* ── Route selector (only shown when multiple routes exist) ── */}
              {data.routes.length > 1 && (
                <div>
                  <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-2">
                    Available routes
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {data.routes.map((r, i) => (
                      <RouteChip
                        key={i}
                        route={r}
                        active={i === selectedIndex}
                        onClick={() => setSelectedIndex(i)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Map / Summary tabs ─────────────────────────────────── */}
              <div className="flex gap-1 bg-white/5 rounded-xl p-1 ring-1 ring-white/10">
                <TabButton
                  active={activeTab === "map"}
                  onClick={() => setActiveTab("map")}
                  icon="🗺️"
                  label="Map View"
                />
                <TabButton
                  active={activeTab === "summary"}
                  onClick={() => setActiveTab("summary")}
                  icon="📋"
                  label="Summary"
                />
              </div>

              {/* Tab content */}
              {activeTab === "map" ? (
                <div className="space-y-4">
                  <WeatherMap data={selectedRoute} onRefresh={refresh} />
                  {/* Quick cards below map */}
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                    {selectedRoute.waypoints.map((wp) => (
                      <MiniCard key={wp.index} waypoint={wp} />
                    ))}
                  </div>
                </div>
              ) : (
                <WeatherSummary
                  data={selectedRoute}
                  onRefresh={refresh}
                  refreshing={loading}
                />
              )}
            </div>
          )}
        </main>

        {/* ── Footer ── */}
        <footer className="border-t border-white/5 py-4 text-center text-xs text-white/20">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span>RedahLuhh</span>
            <span className="text-white/10">·</span>
            <a href="/changelog" className="hover:text-white/50 transition-colors">v0.3.0</a>
            <span className="text-white/10">·</span>
            <span>
              by{" "}
              <a
                href="https://syaqi.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white/50 transition-colors underline underline-offset-2"
              >
                Syaqirah
              </a>
            </span>
            <span className="text-white/10">·</span>
            <span>Built for Malaysian riders</span>
          </div>
          {providerStatus && (
            <div className="mt-1.5 flex items-center justify-center gap-1">
              <span>{PROVIDER_ICONS[providerStatus.primary] ?? "🌤️"}</span>
              <span className="text-[10px]">
                {PROVIDER_LABELS[providerStatus.primary] ?? providerStatus.primary}
              </span>
            </div>
          )}
        </footer>
      </div>
    </APIProvider>
  );
}

// ── Route selector chip ────────────────────────────────────────────────────

function RouteChip({
  route,
  active,
  onClick,
}: {
  route: RouteWeatherResponse;
  active: boolean;
  onClick: () => void;
}) {
  const scoreBg = STATUS_SCORE_BG[route.overall_status] ?? STATUS_SCORE_BG.green;
  const fmtDuration = (m: number) => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return h === 0 ? `${min}m` : min === 0 ? `${h}h` : `${h}h ${min}m`;
  };

  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex-shrink-0 rounded-xl border px-3.5 py-2.5 text-left transition-all",
        active
          ? "bg-brand-500/20 border-brand-500/60 ring-1 ring-brand-500/40"
          : "bg-white/5 border-white/10 hover:border-white/20"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {route.is_recommended && (
          <span className="text-[9px] font-bold bg-brand-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide">
            Best
          </span>
        )}
        <span className="text-xs font-semibold text-white/80">{route.route_label}</span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-white/40">
        <span>{route.route.total_distance_km} km</span>
        <span>·</span>
        <span>{fmtDuration(route.route.total_duration_minutes)}</span>
        <span className={clsx("ml-1 px-1.5 py-0.5 rounded-full border text-[10px]", scoreBg)}>
          {route.overall_label}
        </span>
      </div>
    </button>
  );
}

// ── Small helper components ────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all",
        active
          ? "bg-brand-500 text-white shadow"
          : "text-white/40 hover:text-white/70"
      )}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}

function MiniCard({ waypoint }: { waypoint: Waypoint }) {
  return (
    <div className="flex-shrink-0 bg-white/5 rounded-xl px-3 py-2 ring-1 ring-white/10 text-center min-w-[72px]">
      <span className="text-xl leading-none block mb-1">
        {waypoint.weather.icon_code || "🌡️"}
      </span>
      <p className="text-xs font-semibold text-white/80 truncate">
        {waypoint.label}
      </p>
      <p className="text-xs text-white/50 font-medium">{waypoint.weather.temperature}°C</p>
      <p className="text-[10px] text-white/30 truncate mt-0.5 max-w-[68px]">
        {waypoint.weather.description}
      </p>
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="w-full h-[480px] rounded-2xl bg-white/5 ring-1 ring-white/10 animate-pulse flex items-center justify-center">
      <span className="text-white/20 text-sm">Loading map…</span>
    </div>
  );
}

const WEATHER_EMOJIS = ["☀️", "⛅", "☁️", "🌦️", "🌧️", "⛈️"];

function ResultSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Motorcycle riding across the route */}
      <div className="rounded-2xl bg-dark-700/60 ring-1 ring-white/10 p-8 flex flex-col items-center gap-6">

        {/* Bike + route track */}
        <div className="relative w-full max-w-[280px] h-10 flex items-center">
          {/* Glow track */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-white/8 overflow-hidden">
            <div className="absolute inset-y-0 w-1/3 bg-brand-500/50 animate-shimmer" />
          </div>
          {/* Endpoint dots */}
          <div className="w-3 h-3 rounded-full bg-brand-500 ring-2 ring-dark-700 z-10 flex-shrink-0" />
          <div className="flex-1" />
          <div className="w-3 h-3 rounded-full bg-white/25 ring-2 ring-dark-700 z-10 flex-shrink-0" />
          {/* Riding motorcycle */}
          <span
            className="absolute top-1/2 -translate-y-full text-2xl animate-ride"
            style={{ willChange: "left" }}
          >
            🏍️
          </span>
        </div>

        {/* Label */}
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-white/80">
            Calculating route…
          </p>
          <p className="text-xs text-white/30">
            Checking live weather at every waypoint
          </p>
        </div>

        {/* Weather emoji row — staggered pulse */}
        <div className="flex items-center gap-3">
          {WEATHER_EMOJIS.map((emoji, i) => (
            <span
              key={i}
              className="text-2xl animate-pulse"
              style={{ animationDelay: `${i * 0.18}s`, opacity: 0.35 }}
            >
              {emoji}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
