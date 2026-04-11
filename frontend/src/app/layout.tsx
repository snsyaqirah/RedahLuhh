import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RedahLuhh — Redah Tanpa Ragu",
  description:
    "Smart route weather tracker for Malaysian motorcyclists. See the weather along your entire route, not just at the destination.",
  keywords: ["weather", "route", "motorcycle", "Malaysia", "rain", "riding"],
  authors: [{ name: "RedahLuhh" }],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RedahLuhh",
    startupImage: "/icons/512",
  },
  icons: {
    icon: "/icons/192",
    apple: "/icons/192",
    shortcut: "/icons/192",
  },
};

export const viewport: Viewport = {
  themeColor: "#e94560",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-dark-900 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
