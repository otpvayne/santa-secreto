import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Todas las rutas dependen de la sesión y de datos secretos: se renderizan por petición.
  // Ver docs/ARQUITECTURA.md §10.
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite", "pg", "sharp"],
  experimental: {
    serverActions: {
      // Las fotos se comprimen en el navegador antes de subirlas; el servidor acepta hasta 4 MB.
      bodySizeLimit: "4.5mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
