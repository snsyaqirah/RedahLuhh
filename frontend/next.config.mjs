/** @type {import('next').NextConfig} */
const nextConfig = {
  // "standalone" is for Docker — Vercel handles its own build, so remove it
  // when deploying to Vercel. Keep it here; Vercel ignores it.
  reactStrictMode: true,
};

export default nextConfig;
