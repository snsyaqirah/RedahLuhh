"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import clsx from "clsx";
import { decodePolyline } from "@/lib/api";
import { RouteWeatherResponse, Waypoint, WeatherStatus } from "@/lib/types";

// ── Colour palette ─────────────────────────────────────────────────────────
const SEG_COLOR: Record<WeatherStatus, string> = {
  green:  "#22c55e",
  yellow: "#f59e0b",
  red:    "#ef4444",
};

// ── Nearest-waypoint lookup (cheap lat/lng distance) ─────────────────────
function nearestStatus(
  lat: number,
  lng: number,
  waypoints: Waypoint[]
): WeatherStatus {
  let best = waypoints[0];
  let bestD = Infinity;
  for (const wp of waypoints) {
    const d = (wp.lat - lat) ** 2 + (wp.lng - lng) ** 2;
    if (d < bestD) { bestD = d; best = wp; }
  }
  return best.weather.status;
}

// ── Color-coded route (multi-segment polyline) ────────────────────────────
function ColoredRoute({
  encodedPolyline,
  waypoints,
}: {
  encodedPolyline: string;
  waypoints: Waypoint[];
}) {
  const map = useMap();
  const linesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!map) return;
    linesRef.current.forEach((l) => l.setMap(null));
    linesRef.current = [];

    const path = decodePolyline(encodedPolyline);
    if (!path.length) return;

    // Group consecutive points by status into segments
    type Seg = { path: { lat: number; lng: number }[]; status: WeatherStatus };
    const segments: Seg[] = [];
    let curStatus = nearestStatus(path[0].lat, path[0].lng, waypoints);
    let curSeg: { lat: number; lng: number }[] = [path[0]];

    for (let i = 1; i < path.length; i++) {
      const s = nearestStatus(path[i].lat, path[i].lng, waypoints);
      if (s !== curStatus) {
        segments.push({ path: curSeg, status: curStatus });
        curStatus = s;
        curSeg = [];
      }
      curSeg.push(path[i]);
    }
    if (curSeg.length) segments.push({ path: curSeg, status: curStatus });

    // Draw each segment
    linesRef.current = segments.map(
      (seg) =>
        new google.maps.Polyline({
          path: seg.path,
          geodesic: true,
          strokeColor: SEG_COLOR[seg.status],
          strokeOpacity: 0.92,
          strokeWeight: 6,
          map,
        })
    );

    // Fit map to route
    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 60);

    return () => {
      linesRef.current.forEach((l) => l.setMap(null));
      linesRef.current = [];
    };
  }, [map, encodedPolyline, waypoints]);

  return null;
}

// ── Floating emoji marker (no pin backing) ────────────────────────────────
function EmojiMarker({ waypoint }: { waypoint: Waypoint }) {
  const isEndpoint =
    waypoint.label === "Start" || waypoint.label === "Destination";

  return (
    <AdvancedMarker
      position={{ lat: waypoint.lat, lng: waypoint.lng }}
      title={`${waypoint.label}: ${waypoint.weather.description} · ${waypoint.weather.temperature}°C`}
      zIndex={isEndpoint ? 10 : 5}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
          cursor: "default",
        }}
      >
        <span
          style={{
            fontSize: isEndpoint ? 26 : 20,
            lineHeight: 1,
            filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.9))",
          }}
        >
          {waypoint.weather.icon_code || "🌡️"}
        </span>
        {isEndpoint && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "#fff",
              background: "rgba(0,0,0,0.65)",
              borderRadius: 4,
              padding: "1px 4px",
              letterSpacing: "0.04em",
              backdropFilter: "blur(4px)",
            }}
          >
            {waypoint.label.toUpperCase()}
          </span>
        )}
      </div>
    </AdvancedMarker>
  );
}

// ── GPS motorcycle marker ─────────────────────────────────────────────────
function GpsDot({ position }: { position: { lat: number; lng: number } }) {
  return (
    <AdvancedMarker position={position} zIndex={20} title="You are here">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        {/* Pulse ring */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              position: "absolute",
              inset: -10,
              borderRadius: "50%",
              background: "rgba(59,130,246,0.2)",
              animation: "pulse 2s ease-in-out infinite",
            }}
          />
          <span style={{ fontSize: 28, lineHeight: 1, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.9))" }}>
            🏍️
          </span>
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "#fff",
            background: "#3b82f6",
            borderRadius: 4,
            padding: "1px 5px",
            letterSpacing: "0.04em",
            boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
          }}
        >
          YOU
        </span>
      </div>
    </AdvancedMarker>
  );
}

// ── Map controller: follow GPS or fit route ───────────────────────────────
function MapController({
  encodedPolyline,
  gpsPos,
  following,
}: {
  encodedPolyline: string;
  gpsPos: { lat: number; lng: number } | null;
  following: boolean;
}) {
  const map = useMap();

  // When following mode starts, center on GPS
  useEffect(() => {
    if (!map || !following || !gpsPos) return;
    map.panTo(gpsPos);
    map.setZoom(16);
  }, [map, following, gpsPos?.lat, gpsPos?.lng]);

  return null;
}

// ── Navigate button ────────────────────────────────────────────────────────
function NavigateButton({
  following,
  onToggle,
}: {
  following: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={clsx(
        "absolute top-4 right-4 flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl shadow-lg transition-all active:scale-95",
        following
          ? "bg-blue-500 hover:bg-blue-600 text-white ring-2 ring-white/30"
          : "bg-brand-500 hover:bg-brand-600 text-white"
      )}
    >
      <span>{following ? "📍" : "🧭"}</span>
      {following ? "Stop" : "Go Now"}
    </button>
  );
}

// ── Main map component ─────────────────────────────────────────────────────
interface WeatherMapProps {
  data: RouteWeatherResponse;
  onRefresh?: () => void;
}

export function WeatherMap({ data, onRefresh }: WeatherMapProps) {
  const [gpsPos, setGpsPos]           = useState<{ lat: number; lng: number } | null>(null);
  const [following, setFollowing]     = useState(false);
  const [gpsError, setGpsError]       = useState<string | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [minutesAgo, setMinutesAgo]   = useState(0);

  const watchIdRef      = useRef<number | null>(null);
  const wakeLockRef     = useRef<any>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const minuteTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Day/night map theme — Malaysia local time (UTC+8), 06:00-19:00 = light
  const localHour = (new Date().getUTCHours() + 8) % 24;
  const colorScheme = localHour >= 6 && localHour < 19 ? "LIGHT" as const : "DARK" as const;

  // Release wake lock when tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden" && wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
        setWakeLockActive(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const startFollowing = useCallback(async () => {
    if (!navigator.geolocation) {
      setGpsError("GPS not supported on this device.");
      return;
    }
    setGpsError(null);
    setFollowing(true);
    setLastRefresh(new Date());
    setMinutesAgo(0);

    // Request screen wake lock
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        setWakeLockActive(true);
        wakeLockRef.current.addEventListener("release", () => setWakeLockActive(false));
      }
    } catch {}

    // 15-minute weather refresh interval
    if (onRefresh) {
      refreshTimerRef.current = setInterval(() => {
        onRefresh();
        setLastRefresh(new Date());
        setMinutesAgo(0);
      }, 15 * 60 * 1000);
    }

    // Per-minute counter for "Updated X min ago" badge
    minuteTimerRef.current = setInterval(() => {
      setMinutesAgo((m) => m + 1);
    }, 60_000);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setGpsPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        setGpsError("Location access denied. Enable GPS in browser settings.");
        setFollowing(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [onRefresh]);

  const stopFollowing = useCallback(() => {
    setFollowing(false);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (minuteTimerRef.current) {
      clearInterval(minuteTimerRef.current);
      minuteTimerRef.current = null;
    }
  }, []);

  // Clean up all timers + watchers on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (wakeLockRef.current) wakeLockRef.current.release();
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      if (minuteTimerRef.current) clearInterval(minuteTimerRef.current);
    };
  }, []);

  const mapContainer = (
    <div
      className={clsx(
        "relative overflow-hidden",
        following
          ? "fixed inset-0 z-[60]"
          : "w-full h-[480px] rounded-2xl ring-1 ring-white/10"
      )}
    >
      <Map
        mapId="redahluhh-map"
        defaultCenter={{ lat: 3.139, lng: 101.6869 }}
        defaultZoom={8}
        gestureHandling="greedy"
        disableDefaultUI={false}
        style={{ width: "100%", height: "100%" }}
        colorScheme={colorScheme}
      >
        <ColoredRoute
          encodedPolyline={data.route.encoded_polyline}
          waypoints={data.waypoints}
        />
        {data.waypoints.map((wp) => (
          <EmojiMarker key={wp.index} waypoint={wp} />
        ))}
        {gpsPos && <GpsDot position={gpsPos} />}
        <MapController
          encodedPolyline={data.route.encoded_polyline}
          gpsPos={gpsPos}
          following={following}
        />
      </Map>

      {/* Go Now / Stop toggle — top right */}
      <NavigateButton
        following={following}
        onToggle={following ? stopFollowing : startFollowing}
      />

      {/* GPS error */}
      {gpsError && (
        <div className="absolute top-14 right-4 bg-red-500/90 text-white text-xs rounded-xl px-3 py-2 max-w-[200px] shadow-lg">
          {gpsError}
        </div>
      )}

      {/* Legend — bottom left */}
      <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 text-xs text-white/80 space-y-1 ring-1 ring-white/10">
        <LegendRow color={SEG_COLOR.green}  label="Clear / Partly Cloudy" />
        <LegendRow color={SEG_COLOR.yellow} label="Cloudy / Light Rain" />
        <LegendRow color={SEG_COLOR.red}    label="Rain / Storm" />
      </div>

      {/* Following mode indicators — top left */}
      {following && (
        <div className="absolute top-4 left-4 flex flex-col gap-1.5">
          <div className="bg-blue-500/90 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Live GPS
            {wakeLockActive && (
              <span className="ml-1 bg-white/25 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide">
                Screen On
              </span>
            )}
          </div>
          {lastRefresh && (
            <div className="bg-black/60 backdrop-blur-sm text-white/60 text-[10px] px-2.5 py-1 rounded-lg self-start">
              {minutesAgo === 0 ? "Updated just now" : `Updated ${minutesAgo}m ago`}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Portal into document.body when full-screen so it escapes any CSS transform
  // containing block created by parent animations (e.g. animate-slide-up).
  if (following && typeof document !== "undefined") {
    return createPortal(mapContainer, document.body);
  }
  return mapContainer;
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 h-1.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  );
}
