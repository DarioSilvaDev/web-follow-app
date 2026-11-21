import type { NextConfig } from "next";
import path from "path";

// Destino server-side del rewrite de `/api/:path*`.
// Server-side only (SIN prefijo NEXT_PUBLIC_): se lee al evaluar este archivo,
// es decir en build time / arranque del servidor. En Vercel se define en
// Project Settings > Environment Variables (por environment).
const DEFAULT_API_PROXY_TARGET = "https://api-follow-app.onrender.com";
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? DEFAULT_API_PROXY_TARGET;

// Fail-fast: cortar el build con un error claro si el valor no es una URL
// http(s) válida sin path (anclado con $ para rechazar también trailing slash
// y así evitar destinos con `//api/`).
if (!/^https?:\/\/[^/]+$/.test(API_PROXY_TARGET)) {
  throw new Error(
    `API_PROXY_TARGET inválida: "${process.env.API_PROXY_TARGET}". ` +
      "Debe ser una URL http(s) sin path, ej. http://localhost:3001 " +
      "(sin barra final).",
  );
}

const nextConfig: NextConfig = {
  turbopack: {
    // Monorepo: fija el root de Turbopack en el directorio del frontend para
    // evitar el warning "We detected multiple lockfiles ... set turbopack.root".
    root: path.join(__dirname),
  },
  // Proxy de API como rewrite dinámico (reemplaza a vercel.json).
  // Forma array (equivale a afterFiles): se aplica después del filesystem
  // (páginas, /public, route handlers) y antes de las rutas dinámicas.
  // Funciona igual en `next dev`, self-hosting y Vercel.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY_TARGET}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
