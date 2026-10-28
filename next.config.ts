import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  productionBrowserSourceMaps: false,
  // Upload de planilha (Administração → Upload) manda as linhas já lidas no navegador;
  // a maior planilha de hoje (colaboradores) passa de 1 MB, o limite padrão.
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      {
        // O Organograma do hub antigo abre num iframe da própria página /hub
        // (sections/organograma.js); só ele pode ser emoldurado, e só pela mesma origem.
        source: "/legado-ui/organograma.html",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // Links públicos: o token não pode vazar para outro site pelo Referer.
        source: "/publico/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
