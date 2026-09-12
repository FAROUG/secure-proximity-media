/** @type {import('next').NextConfig} */

// 1. Get the full API URL from your environment variables
const apiEnvUrl = process.env.NEXT_PUBLIC_API_URL; // e.g. "https://192.168.1.70:4000"

// 2. Set fallback arrays
let allowedOrigins = [];

if (apiEnvUrl) {
  try {
    // Extract just the hostname (e.g. "192.168.1.70") from the full URL string
    const hostName = new URL(apiEnvUrl).hostname;
    allowedOrigins.push(hostName);
  } catch (error) {
    console.error("Invalid NEXT_PUBLIC_API_URL format in .env.local", error);
  }
}

const nextConfig = {
  // 3. Inject the parsed IP dynamically
  allowedDevOrigins: allowedOrigins.length > 0 ? allowedOrigins : ['localhost'],
};

module.exports = nextConfig;
