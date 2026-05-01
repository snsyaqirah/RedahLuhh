"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { format } from "date-fns";
import clsx from "clsx";

// Malaysia bounding box — biases autocomplete results without hard restriction
const MY_BOUNDS = {
  north: 7.4,
  south: 0.85,
  east:  119.3,
  west:  99.6,
};

type DepartureMode = "now" | "depart_at";

interface RouteFormProps {
  onSearch: (origin: string, destination: string, departureTime?: Date) => void;
  loading: boolean;
}

export function RouteForm({ onSearch, loading }: RouteFormProps) {
  const [origin, setOrigin]           = useState("");
  const [destination, setDestination] = useState("");
  const [mode, setMode]               = useState<DepartureMode>("now");
  const [deptDate, setDeptDate]       = useState(() => today());
  const [deptTime, setDeptTime]       = useState(() => currentTime());
  const [pickerOpen, setPickerOpen]   = useState(false);
  const [locLoading, setLocLoading]   = useState(false);
  const [gpsError, setGpsError]       = useState<string | null>(null);
  const [autoDetected, setAutoDetected] = useState(false);

  const geocoder = useMapsLibrary("geocoding");

  const handleSwap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!geocoder) { setLocLoading(false); return; }
        const gc = new (geocoder as any).Geocoder();
        gc.geocode(
          { location: { lat: pos.coords.latitude, lng: pos.coords.longitude } },
          (results: any[], status: string) => {
            setLocLoading(false);
            if (status === "OK" && results[0]) {
              // Prefer a locality or sublocality level result over a full street address
              const preferred = results.find((r: any) =>
                r.types.some((t: string) =>
                  ["sublocality", "locality", "administrative_area_level_3"].includes(t)
                )
              );
              const addr = (preferred ?? results[0]).formatted_address;
              setOrigin(addr);
              setGpsError(null);
            }
          }
        );
      },
      () => {
        setLocLoading(false);
        setGpsError("Allow location: Chrome address bar → 🔒 → Location → Allow");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [geocoder]);

  // Auto-detect location on first mount once geocoder is ready and origin is empty
  useEffect(() => {
    if (autoDetected || origin || !geocoder) return;
    setAutoDetected(true);
    if (navigator.geolocation) handleUseMyLocation();
  }, [geocoder, origin, autoDetected, handleUseMyLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin.trim() || !destination.trim() || loading) return;
    let dept: Date | undefined;
    if (mode === "depart_at" && deptDate && deptTime) {
      dept = new Date(`${deptDate}T${deptTime}`);
    }
    onSearch(origin.trim(), destination.trim(), dept);
    setPickerOpen(false);
  };

  const departureLabel =
    mode === "now"
      ? "Leave now"
      : `Depart at ${formatTimeLabel(deptDate, deptTime)}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* ── Route inputs card ─────────────────────────────────────────── */}
      <div className="bg-dark-700/90 backdrop-blur rounded-2xl ring-1 ring-white/10 overflow-visible">

        {/* Origin row */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="flex flex-col items-center gap-0.5 self-stretch justify-center w-4 flex-shrink-0">
            <span className="w-3 h-3 rounded-full bg-brand-500 border-2 border-brand-400 flex-shrink-0" />
            <span className="w-0.5 flex-1 bg-white/15 min-h-[14px]" />
          </div>
          <PlaceInput
            placeholder="From — where are you starting?"
            value={origin}
            onChange={setOrigin}
          />
          {/* Use my location button */}
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={locLoading}
            aria-label="Use current location"
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/8 transition-colors disabled:opacity-40"
            title="Use my current location"
          >
            {locLoading ? (
              <span className="w-4 h-4 border-2 border-white/20 border-t-brand-500 rounded-full animate-spin" />
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4 text-white/40 hover:text-brand-400"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
              </svg>
            )}
          </button>
        </div>

        {/* GPS denied tip */}
        {gpsError && (
          <p className="px-4 pb-2 text-[11px] text-yellow-400/80 leading-snug">
            📍 {gpsError}
          </p>
        )}

        {/* Divider + Swap */}
        <div className="relative mx-4">
          <div className="border-t border-white/8" />
          <button
            type="button"
            onClick={handleSwap}
            aria-label="Swap origin and destination"
            className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 bg-dark-600 hover:bg-dark-500 rounded-full ring-1 ring-white/15 flex items-center justify-center transition-all active:scale-90"
          >
            <svg
              className="w-4 h-4 text-white/50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 16V4m0 0L3 8m4-4l4 4" />
              <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
        </div>

        {/* Destination row */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="flex flex-col items-center gap-0.5 self-stretch justify-center w-4 flex-shrink-0">
            <span className="w-0.5 flex-1 bg-white/15 min-h-[14px]" />
            <svg
              className="w-4 h-4 text-white/50 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </div>
          <PlaceInput
            placeholder="To — where are you going?"
            value={destination}
            onChange={setDestination}
          />
        </div>
      </div>

      {/* ── Departure time ─────────────────────────────────────────────── */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 hover:bg-white/8 transition-colors text-white/70 hover:text-white/90"
        >
          <svg className="w-4 h-4 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <span>{departureLabel}</span>
          <svg
            className={clsx("w-3.5 h-3.5 opacity-40 transition-transform", pickerOpen && "rotate-180")}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {pickerOpen && (
          <div className="absolute top-full mt-2 left-0 bg-dark-700 rounded-2xl ring-1 ring-white/12 shadow-2xl shadow-black/50 z-50 p-4 min-w-[280px] animate-fade-in">
            <p className="text-xs text-white/30 uppercase tracking-widest mb-3 font-semibold">
              Departure
            </p>

            <label className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/5 cursor-pointer transition-colors">
              <span className={clsx("w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors", mode === "now" ? "border-brand-500 bg-brand-500" : "border-white/30")} />
              <div>
                <p className="text-sm font-medium text-white">Leave now</p>
                <p className="text-xs text-white/40">Use real-time weather</p>
              </div>
              <input type="radio" className="sr-only" checked={mode === "now"} onChange={() => setMode("now")} />
            </label>

            <label className="flex items-start gap-3 py-2.5 px-3 rounded-xl hover:bg-white/5 cursor-pointer transition-colors">
              <span className={clsx("w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 transition-colors", mode === "depart_at" ? "border-brand-500 bg-brand-500" : "border-white/30")} />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Depart at</p>
                <p className="text-xs text-white/40">Schedule a future trip</p>
                {mode === "depart_at" && (
                  <div className="mt-2.5 flex gap-2">
                    <input
                      type="date"
                      value={deptDate}
                      min={today()}
                      onChange={(e) => setDeptDate(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-white/8 text-white text-xs px-2.5 py-1.5 rounded-lg ring-1 ring-white/15 focus:outline-none focus:ring-brand-500 [color-scheme:dark]"
                    />
                    <input
                      type="time"
                      value={deptTime}
                      onChange={(e) => setDeptTime(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-24 bg-white/8 text-white text-xs px-2.5 py-1.5 rounded-lg ring-1 ring-white/15 focus:outline-none focus:ring-brand-500 [color-scheme:dark]"
                    />
                  </div>
                )}
              </div>
              <input type="radio" className="sr-only" checked={mode === "depart_at"} onChange={() => setMode("depart_at")} />
            </label>

            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="mt-3 w-full py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* ── Search button ──────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={loading || !origin.trim() || !destination.trim()}
        className={clsx(
          "w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all",
          loading || !origin.trim() || !destination.trim()
            ? "bg-white/5 text-white/25 cursor-not-allowed ring-1 ring-white/8"
            : "bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/25 active:scale-[0.98]"
        )}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2.5">
            <span className="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />
            Fetching weather along route…
          </span>
        ) : (
          "Check Route Weather"
        )}
      </button>
    </form>
  );
}

// ── Google Places Autocomplete input ──────────────────────────────────────

interface PlaceInputProps {
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
}

function PlaceInput({ placeholder, value, onChange }: PlaceInputProps) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const places    = useMapsLibrary("places");
  const [inputVal, setInputVal] = useState(value);

  // Sync from parent (swap support)
  useEffect(() => {
    setInputVal(value);
    if (inputRef.current) inputRef.current.value = value;
  }, [value]);

  const handleChange = useCallback(
    (val: string) => { setInputVal(val); onChange(val); },
    [onChange]
  );

  const handleClear = useCallback(() => {
    setInputVal("");
    onChange("");
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }, [onChange]);

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const ac = new places.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "name", "geometry"],
      types: ["geocode", "establishment"],
    });

    // Bias strongly towards Malaysia — results outside MY still work if typed explicitly
    ac.setBounds(
      new google.maps.LatLngBounds(
        new google.maps.LatLng(MY_BOUNDS.south, MY_BOUNDS.west),
        new google.maps.LatLng(MY_BOUNDS.north, MY_BOUNDS.east)
      )
    );
    ac.setOptions({ strictBounds: false });

    const listener = ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      // Prefer formatted_address for accuracy; fall back to name
      const addr = place.formatted_address ?? place.name ?? "";
      handleChange(addr);
    });

    return () => google.maps.event.removeListener(listener);
  }, [places, handleChange]);

  return (
    <div className="flex-1 flex items-center gap-1 min-w-0">
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        defaultValue={value}
        onChange={(e) => handleChange(e.target.value)}
        autoComplete="off"
        className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none min-w-0"
      />
      {inputVal && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear input"
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
        >
          <svg className="w-2.5 h-2.5 text-white/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Utils ─────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split("T")[0];
}

function currentTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatTimeLabel(date: string, time: string) {
  try {
    const d = new Date(`${date}T${time}`);
    return format(d, "EEE, d MMM · HH:mm");
  } catch {
    return `${date} ${time}`;
  }
}
