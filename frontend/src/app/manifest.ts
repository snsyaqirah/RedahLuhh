import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RedahLuhh — Smart Route Weather",
    short_name: "RedahLuhh",
    description: "Check weather along your entire route before you ride.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0f",
    theme_color: "#e94560",
    orientation: "portrait",
    categories: ["navigation", "weather", "travel"],
    icons: [
      {
        src: "/icons/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}
