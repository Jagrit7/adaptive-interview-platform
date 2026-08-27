"use client";

import * as React from "react";

interface SessionInfoPanelProps {
  agentId: string | null;
  greeting?: string | null;
  prompt?: string | null;
  payload: object | null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 shrink-0 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Row({
  label,
  value,
  maxHeight = "max-h-32",
}: {
  label: string;
  value: string;
  maxHeight?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-muted-foreground">
          {label}
        </label>
        <CopyButton text={value} />
      </div>
      <pre
        className={`mt-1 ${maxHeight} overflow-auto rounded-md bg-muted px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all`}
      >
        {value}
      </pre>
    </div>
  );
}

export function SessionInfoPanel({
  agentId,
  greeting,
  prompt,
  payload,
}: SessionInfoPanelProps) {
  const [showPayload, setShowPayload] = React.useState(false);
  if (!agentId) return null;
  const payloadJson = payload ? JSON.stringify(payload, null, 2) : "";

  return (
    <div className="space-y-4 border-t pt-4 mt-4">
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">
            Agent ID
          </label>
          <CopyButton text={agentId} />
        </div>
        <code className="mt-1 block rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
          {agentId}
        </code>
      </div>

      {greeting && <Row label="Greeting" value={greeting} />}
      {prompt && <Row label="System Prompt" value={prompt} maxHeight="max-h-64" />}

      {payload && (
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">
              Full Payload
            </label>
            <div className="flex items-center">
              <CopyButton text={payloadJson} />
              <button
                type="button"
                onClick={() => setShowPayload((v) => !v)}
                className="ml-2 shrink-0 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {showPayload ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {showPayload && (
            <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-muted px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all">
              {payloadJson}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
