"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import clsx from "clsx";

import { RouteForm } from "@/components/RouteForm";
import { WeatherSummary } from "@/components/WeatherSummary";
import { useRouteWeather } from "@/hooks/useRouteWeather";
import { RouteWeatherResponse, Waypoint } from "@/lib/types";

// WeatherMap uses useMap which must run client-side
const WeatherMap = dynamic(
  () => import("@/components/WeatherMap").then((m) => m.WeatherMap),
  { ssr: false, loading: () => <MapSkeleton /> }
);

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

const STATUS_SCORE_BG: Record<string, string> = {
  green:  "bg-green-500/15 border-green-500/30 text-green-300",
  yellow: "bg-yellow-400/15 border-yellow-400/30 text-yellow-300",
  red:    "bg-red-500/15 border-red-500/30 text-red-300",
};

export default function HomePage() {
  const { data, selectedRoute, selectedIndex, setSelectedIndex, loading, error, search, refresh } =
    useRouteWeather();
  const [activeTab, setActiveTab] = useState<"map" | "summary">("map");

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
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-white/30">Live</span>
            </div>
          </div>
        </header>

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
                  <WeatherMap data={selectedRoute} />
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
          RedahLuhh · SDG 11 &amp; 13 · Built for Malaysian riders
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
