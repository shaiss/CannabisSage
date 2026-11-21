/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Account page may briefly hold a license key in the fragment before
        // replaceState clears it — never leak via Referer to third parties.
        source: '/account',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }]
      }
    ];
  }
};

module.exports = nextConfig;
