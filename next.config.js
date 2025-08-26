// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // IMPORTANTE: não use output: 'export' (isso quebra /api)
};

module.exports = nextConfig;