import type { Metadata, Viewport } from "next";
import "./globals.css";

const BASE_URL = "https://redahluhh.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "RedahLuhh — Redah Tanpa Ragu | Malaysia",
    template: "%s | RedahLuhh",
  },
  description:
    "RedahLuhh menyemak cuaca masa nyata sepanjang laluan perjalanan anda di Malaysia — bukan sekadar destinasi. Tahu hujan, ribut petir, atau cuaca mendung di setiap kilometer laluan sebelum anda bergerak. Real-time weather along your route for Malaysian riders.",
  keywords: [
    "RedahLuhh",
    "weather along route Malaysia",
    "real time weather Malaysia road",
    "cuaca laluan Malaysia",
    "semak cuaca Malaysia",
    "motorcycle weather app Malaysia",
    "route weather checker Malaysia",
    "weather before riding Malaysia",
    "rain alert motorcycle Malaysia",
    "real time weather Malaysian road",
    "cuaca masa nyata Malaysia",
    "kawasan hujan Malaysia",
    "weather map Malaysia route",
    "weather motorcycle KL",
    "cuaca motosikal Malaysia",
    "hujan lebat laluan",
    "road weather Malaysia",
    "perjalanan selamat cuaca",
  ],
  authors: [{ name: "RedahLuhh", url: BASE_URL }],
  creator: "RedahLuhh",
  publisher: "RedahLuhh",
  manifest: "/manifest.webmanifest",

  openGraph: {
    type: "website",
    url: BASE_URL,
    siteName: "RedahLuhh",
    title: "RedahLuhh — Redah Tanpa Ragu | Malaysia",
    description:
      "Tahu cuaca di setiap kilometer laluan perjalanan anda sebelum bergerak. Real-time weather along your route — not just the destination. Built for Malaysian motorcyclists.",
    locale: "ms_MY",
    alternateLocale: "en_MY",
  },

  twitter: {
    card: "summary_large_image",
    title: "RedahLuhh — Redah Tanpa Ragu",
    description:
      "Check weather for every km of your route before you ride. Built for Malaysian motorcyclists.",
    creator: "@redahluhh",
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  alternates: {
    canonical: BASE_URL,
  },

  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RedahLuhh",
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

// JSON-LD structured data
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "RedahLuhh",
  alternateName: "Redah Tanpa Ragu",
  url: BASE_URL,
  description:
    "Real-time weather tracker along your entire travel route for Malaysian motorcyclists.",
  applicationCategory: "TravelApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires JavaScript",
  inLanguage: ["ms", "en"],
  audience: {
    "@type": "Audience",
    geographicArea: {
      "@type": "Country",
      name: "Malaysia",
    },
  },
  offers: { "@type": "Offer", price: "0", priceCurrency: "MYR" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ms">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen bg-surface-900 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
