"use client"

import dynamic from "next/dynamic"

const VideoAvatarClient = dynamic(
  () =>
    import("@/components/VideoAvatarClient").then((mod) => ({ default: mod.VideoAvatarClient })),
  {
    ssr: false,
  }
)

export default function Home() {
  return <VideoAvatarClient />
}
