import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Changelog",
  description: "RedahLuhh version history and release notes.",
};

const RELEASES = [
  {
    version: "v0.3.0",
    date: "1 May 2025",
    changes: [
      "Weather cascade: XWeather → Meteoblue → Tomorrow.io → Open-Meteo → WeatherAPI",
      "Feedback system with Supabase (public wall + admin dashboard)",
      "Go Now full-screen navigation mode with live GPS tracking",
      "Screen wake lock during navigation — screen stays on while riding",
      "Provider transparency — active weather data source shown in footer",
      "Per-provider quota alerts with automatic fallback notifications",
      "Backend cold-start indicator for Render free tier warm-up",
      "Real-time weather for start & destination waypoints (Tomorrow.io)",
      "MET Malaysia official weather warnings integrated",
      "Day/night map theme — automatic based on Malaysia local time",
      "X clear buttons on route input fields",
      "Auto-detect your location on page load",
      "Location denied tip for Chrome permissions",
      "15-minute weather refresh during Go Now navigation",
    ],
  },
  {
    version: "v0.2.0",
    date: "Apr 2025",
    changes: [
      "Multi-route support — compare up to 3 routes by weather score",
      "Driest Route vs Fastest Route ranking",
      "Google Maps color-coded polyline (green/yellow/red per segment)",
      "Emoji waypoint markers on map with temperature labels",
      "Departure time scheduler for future trip planning",
      "Weather forecast for future trips (Tomorrow.io hourly data)",
    ],
  },
  {
    version: "v0.1.0",
    date: "Apr 2025",
    changes: [
      "Initial launch — route weather for Malaysian motorcyclists",
      "Real-time weather along entire route (not just the destination)",
      "WeatherAPI.com integration for current conditions",
      "Google Routes API for accurate Malaysia routing",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-surface-900 text-white">
      <header className="border-b border-white/5 bg-dark-800/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <span className="text-xl">🏍️</span>
            <span className="font-extrabold text-white">
              Redah<span className="text-brand-500">Luhh</span>
            </span>
          </Link>
          <span className="text-white/20 text-sm ml-1">/ Changelog</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-10">
        <div>
          <h1 className="text-2xl font-bold text-white">Changelog</h1>
          <p className="text-sm text-white/40 mt-1">What&apos;s new in RedahLuhh</p>
        </div>

        {RELEASES.map((release) => (
          <div key={release.version} className="space-y-3">
            <div className="flex items-baseline gap-3">
              <span className="text-brand-400 font-bold text-lg">{release.version}</span>
              <span className="text-xs text-white/25">{release.date}</span>
            </div>
            <ul className="space-y-2">
              {release.changes.map((change, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                  <span className="text-brand-500 mt-0.5 flex-shrink-0">•</span>
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </main>

      <footer className="border-t border-white/5 py-6 text-center text-xs text-white/20">
        <Link href="/" className="hover:text-white/40 transition-colors">
          ← Back to RedahLuhh
        </Link>
      </footer>
    </div>
  );
}
