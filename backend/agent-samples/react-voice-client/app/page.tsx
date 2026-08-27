"use client"

import dynamic from "next/dynamic"

const VoiceClient = dynamic(
  () => import("@/components/VoiceClient").then((mod) => ({ default: mod.VoiceClient })),
  {
    ssr: false,
  }
)

export default function Home() {
  return <VoiceClient />
}
