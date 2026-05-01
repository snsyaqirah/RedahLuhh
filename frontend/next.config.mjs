/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        // HTML pages — always revalidate so users get the latest deploy immediately
        source: "/((?!_next/static|_next/image|icons|.*\\.(?:ico|png|jpg|svg|webp|woff2?)).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
