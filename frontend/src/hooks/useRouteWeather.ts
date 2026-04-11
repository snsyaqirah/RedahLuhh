"use client";

import { useCallback, useRef, useState } from "react";
import { fetchRouteWeather } from "@/lib/api";
import {
  MultiRouteWeatherResponse,
  RouteWeatherRequest,
  RouteWeatherResponse,
} from "@/lib/types";

export function useRouteWeather() {
  const [data, setData] = useState<MultiRouteWeatherResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastReq = useRef<RouteWeatherRequest | null>(null);

  const search = useCallback(async (req: RouteWeatherRequest) => {
    lastReq.current = req;
    setLoading(true);
    setError(null);
    setSelectedIndex(0);
    try {
      const result = await fetchRouteWeather(req);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (lastReq.current) await search(lastReq.current);
  }, [search]);

  const selectedRoute: RouteWeatherResponse | null =
    data?.routes?.length
      ? (data.routes[selectedIndex] ?? data.routes[0])
      : null;

  return {
    data,
    selectedRoute,
    selectedIndex,
    setSelectedIndex,
    loading,
    error,
    search,
    refresh,
  };
}
