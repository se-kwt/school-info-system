/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets the dev server serve /_next/* assets and API routes when accessed via a
  // non-localhost origin (e.g. a Tailscale IP from another device on the network).
  allowedDevOrigins: ["100.88.158.51"],
};
export default nextConfig;
