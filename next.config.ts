import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // qualidades usadas no app (o Next 16 exige declarar)
    qualities: [65, 75],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
