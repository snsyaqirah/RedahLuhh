"use client";

import { format } from "date-fns";
import { Waypoint, WeatherStatus } from "@/lib/types";
import clsx from "clsx";

const RING: Record<WeatherStatus, string> = {
  green:  "ring-green-500/40",
  yellow: "ring-yellow-400/50",
  red:    "ring-red-500/60",
};

const DOT: Record<WeatherStatus, string> = {
  green:  "bg-green-400",
  yellow: "bg-yellow-400",
  red:    "bg-red-500 animate-pulse",
};

const TEMP_COLOR: Record<WeatherStatus, string> = {
  green:  "text-white",
  yellow: "text-yellow-300",
  red:    "text-red-300",
};

interface WeatherCardProps {
  waypoint: Waypoint;
}

export function WeatherCard({ waypoint }: WeatherCardProps) {
  const { weather, label, eta } = waypoint;
  const etaDate = new Date(eta);

  return (
    <div
      className={clsx(
        "flex-shrink-0 w-48 rounded-2xl p-4 ring-1 bg-white/4 backdrop-blur transition-all hover:bg-white/7",
        RING[weather.status]
      )}
    >
      {/* Location + status dot */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-white/70 truncate max-w-[110px]">
          {label}
        </span>
        <span className={clsx("w-2 h-2 rounded-full flex-shrink-0", DOT[weather.status])} />
      </div>

      {/* Big icon + temp */}
      <div className="flex items-end gap-2 mb-2">
        <span className="text-4xl leading-none" aria-label={weather.description}>
          {weather.icon_code || "🌡️"}
        </span>
        <span className={clsx("text-3xl font-bold leading-none", TEMP_COLOR[weather.status])}>
          {weather.temperature}°
        </span>
      </div>

      {/* Weather description — the main info */}
      <p className="text-sm font-semibold text-white/90 leading-tight mb-3">
        {weather.description}
      </p>

      {/* Compact stats */}
      <div className="space-y-1.5 text-xs text-white/50">
        <div className="flex justify-between">
          <span>🌧 Rain</span>
          <span className={clsx(
            "font-medium",
            weather.precipitation_prob >= 0.6 ? "text-yellow-400" : "text-white/70"
          )}>
            {Math.round(weather.precipitation_prob * 100)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span>💨 Wind</span>
          <span className="text-white/70">{weather.wind_speed} m/s</span>
        </div>
        <div className="flex justify-between">
          <span>💧 Humidity</span>
          <span className="text-white/70">{weather.humidity}%</span>
        </div>
        <div className="flex justify-between">
          <span>🌡 Feels</span>
          <span className="text-white/70">{weather.feels_like}°C</span>
        </div>
      </div>

      {/* ETA */}
      <div className="mt-3 pt-2.5 border-t border-white/8 flex justify-between text-xs">
        <span className="text-white/30">ETA</span>
        <span className="text-white/60 font-medium tabular-nums">
          {format(etaDate, "HH:mm")}
        </span>
      </div>
    </div>
  );
}
