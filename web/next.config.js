/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Account page may briefly hold a license key in the fragment before
        // history is replaced — never leak via Referer, and block third-party
        // scripts that could read the fragment before cleanup.
        source: '/account',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Content-Security-Policy',
            // 'self' only for script hosts (unsafe-inline/eval needed by Next).
            // External script origins are intentionally omitted.
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; object-src 'none'; base-uri 'self'"
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
