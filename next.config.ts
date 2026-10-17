import type { NextConfig } from "next";

// CSP (with a per-request nonce) is set in middleware; the static headers live here.
const config: NextConfig = {
    poweredByHeader: false,
    reactStrictMode: true,
    webpack: (config) => {
        config.infrastructureLogging = { level: "error" };
        return config;
    },
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "Referrer-Policy", value: "same-origin" },
                    {
                        key: "Strict-Transport-Security",
                        value: "max-age=63072000; includeSubDomains; preload",
                    },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
                    },
                    { key: "Cache-Control", value: "private, no-store" },
                ],
            },
        ];
    },
};
export default config;
