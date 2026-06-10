/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
    domains: ['res.cloudinary.com', 'images.unsplash.com'],
  },
}

module.exports = nextConfig
