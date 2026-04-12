import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type BackendStatus = "checking" | "online" | "offline";

export function useBackendHealth(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>("checking");

  useEffect(() => {
    const controller = new AbortController();
    // Render free tier can take up to ~30s to wake — give it 35s
    const timeout = setTimeout(() => controller.abort(), 35_000);

    fetch(`${API_BASE}/health`, { signal: controller.signal })
      .then((r) => setStatus(r.ok ? "online" : "offline"))
      .catch(() => setStatus("offline"))
      .finally(() => clearTimeout(timeout));

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  return status;
}
