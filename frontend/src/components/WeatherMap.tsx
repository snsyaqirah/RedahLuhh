"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  hasGps,
}: {
  following: boolean;
  onToggle: () => void;
  hasGps: boolean;
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
      {following ? "Following…" : "Go Now"}
    </button>
  );
}

// ── Main map component ─────────────────────────────────────────────────────
interface WeatherMapProps {
  data: RouteWeatherResponse;
}

export function WeatherMap({ data }: WeatherMapProps) {
  const [gpsPos, setGpsPos] = useState<{ lat: number; lng: number } | null>(null);
  const [following, setFollowing] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const startFollowing = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("GPS not supported on this device.");
      return;
    }
    setGpsError(null);
    setFollowing(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setGpsError("Location access denied. Enable GPS in browser settings.");
        setFollowing(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const stopFollowing = useCallback(() => {
    setFollowing(false);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-[480px] rounded-2xl overflow-hidden ring-1 ring-white/10">
      <Map
        mapId="redahluhh-map"
        defaultCenter={{ lat: 3.139, lng: 101.6869 }}
        defaultZoom={8}
        gestureHandling="greedy"
        disableDefaultUI={false}
        style={{ width: "100%", height: "100%" }}
        colorScheme="DARK"
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

      {/* Go Now / Following toggle */}
      <NavigateButton
        following={following}
        onToggle={following ? stopFollowing : startFollowing}
        hasGps={!!gpsPos}
      />

      {/* GPS error toast */}
      {gpsError && (
        <div className="absolute top-14 right-4 bg-red-500/90 text-white text-xs rounded-xl px-3 py-2 max-w-[200px] shadow-lg">
          {gpsError}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 text-xs text-white/80 space-y-1 ring-1 ring-white/10">
        <LegendRow color={SEG_COLOR.green}  label="Clear / Partly Cloudy" />
        <LegendRow color={SEG_COLOR.yellow} label="Cloudy / Light Rain" />
        <LegendRow color={SEG_COLOR.red}    label="Rain / Storm" />
      </div>

      {/* Following mode indicator */}
      {following && (
        <div className="absolute top-4 left-4 bg-blue-500/90 text-white text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          Live GPS
        </div>
      )}
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 h-1.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  );
}
