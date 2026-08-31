"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EditableText } from "@/components/ui/EditableText";
import { Card } from "@/components/ui/Card";
import { Waveform } from "@/components/ui/Waveform";
import { useBuilderStore } from "@/store/builderStore";
const RECIPE_ACCENTS = [
  "var(--accent-indigo)",
  "var(--accent-amber)",
  "var(--accent-teal)",
  "var(--accent-rose)",
  "var(--accent-violet)",
];

export default function HomePage() {
  const router = useRouter();
  const [projectName, setProjectName] = useState("");
  const newPanel = useBuilderStore((s) => s.newPanel);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative"
      style={{ padding: "24px" }}
    >
      <div
        className="absolute"
        style={{
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <Waveform variant="ambient" />
      </div>

      <div
        className="relative z-10 flex flex-col items-center gap-8"
        style={{ maxWidth: "720px", width: "100%" }}
      >
        <div style={{ textAlign: "center", width: "100%" }}>
          <EditableText
            value={projectName}
            onChange={setProjectName}
            placeholder="Untitled panel"
            isHero
          />
        </div>

        <div
          className="flex gap-6 w-full"
          style={{ flexDirection: "column" }}
        >
          <div className="flex gap-6 w-full md:flex-row" style={{ flexDirection: "column" }}>
            <div style={{ flex: 1 }}>
              <Card
                hoverable
                onClick={() => router.push("/recipes")}
                style={{ height: "100%" }}
              >
                <h2 className="text-heading" style={{ marginBottom: "8px" }}>
                  Use a recipe
                </h2>
                <p className="text-body text-muted" style={{ marginBottom: "16px" }}>
                  Start from a ready-made panel like an SDE interview or a UPSC-style panel.
                </p>
                <div className="flex gap-2">
                  {RECIPE_ACCENTS.map((color, i) => (
                    <div
                      key={i}
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        backgroundColor: color,
                      }}
                    />
                  ))}
                </div>
              </Card>
            </div>

            <div style={{ flex: 1 }}>
              <Card
                hoverable
                onClick={() => {
                  // Clear panelId, agents and scorer before opening the builder.
                  // Without this, "Build from scratch" inherits whatever panel
                  // was last opened - including its Supabase row id - so the
                  // first Save silently OVERWRITES that saved panel instead of
                  // creating a new one.
                  newPanel();
                  router.push("/builder");
                }}
                style={{ height: "100%" }}
              >
                <h2 className="text-heading" style={{ marginBottom: "8px" }}>
                  Build from scratch
                </h2>
                <p className="text-body text-muted">
                  Add agents one at a time and configure everything yourself.
                </p>
              </Card>
            </div>
          </div>

          <Card
            hoverable
            onClick={() => router.push("/panels")}
            style={{ width: "100%" }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-heading" style={{ marginBottom: "8px" }}>
                  Open a saved panel
                </h2>
                <p className="text-body text-muted">
                  Pick up a panel you already built. Signing in is required, since
                  panels are saved to your account.
                </p>
              </div>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ flexShrink: 0, opacity: 0.5 }}
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
