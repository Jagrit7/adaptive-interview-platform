"use client";

import dynamic from "next/dynamic";

const VoiceTestClient = dynamic(() => import("./VoiceTestClient"), {
  ssr: false,
});

export default function TestVoicePage() {
  return <VoiceTestClient />;
}
