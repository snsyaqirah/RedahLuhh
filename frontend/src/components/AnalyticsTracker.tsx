"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export function AnalyticsTracker() {
  useEffect(() => {
    try {
      const isAdmin = localStorage.getItem("isAdmin") === "true";
      if (isAdmin) return;
      supabase.from("analytics_events").insert({ event: "page_view" });
    } catch {}
  }, []);
  return null;
}
