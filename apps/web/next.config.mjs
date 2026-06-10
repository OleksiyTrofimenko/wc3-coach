/** @type {import('next').NextConfig} */

const API_NODE_URL = process.env.API_NODE_URL ?? "http://localhost:8787";
const API_PY_URL = process.env.API_PY_URL ?? "http://localhost:8001";

const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/node/:path*",
        destination: `${API_NODE_URL}/:path*`,
      },
      {
        source: "/api/py/:path*",
        destination: `${API_PY_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
