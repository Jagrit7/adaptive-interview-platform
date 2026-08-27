"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ShenState, RTMPublish } from "@agora/agent-ui-kit";

const EMPTY_STATE: ShenState = {
  sdkLoaded: false,
  initialized: false,
  faceState: "",
  measurementState: "",
  progress: 0,
  heartRate: null,
  hrvSdnn: null,
  stressIndex: null,
  breathingRate: null,
  systolicBP: null,
  diastolicBP: null,
  cardiacWorkload: null,
  signalQuality: null,
  realtimeHr: null,
  results: null,
};

/**
 * Hook for Shen.AI camera-based vitals measurement.
 *
 * Dynamically loads the Shen.AI WASM SDK, initializes with the given API key,
 * polls SDK state, and publishes measurement results via RTM.
 *
 * @param enabled - Whether to load and run the SDK
 * @param apiKey - Shen.AI API key
 * @param rtmPublish - Function to publish RTM messages (null = not ready)
 * @param canvasId - Canvas element ID for SDK rendering (default: "shen-canvas")
 */
export function useShenai(
  enabled: boolean,
  apiKey: string,
  rtmPublish: RTMPublish | null,
  canvasId: string = "shen-canvas",
): ShenState {
  const [state, setState] = useState<ShenState>(EMPTY_STATE);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdkRef = useRef<any>(null);
  const loadStartedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPublishRef = useRef<number>(0);
  const rtmPublishRef = useRef(rtmPublish);
  rtmPublishRef.current = rtmPublish;
  // Keep last known values so they persist across measurement restarts
  const lastVitalsRef = useRef<Partial<ShenState>>({});
  const lastMeasurementStateRef = useRef<string>("");
  const lastFaceStateRef = useRef<string>("");
  const destroyedRef = useRef(false);

  // Suppress WASM errors that fire after SDK teardown (internal setTimeout/worker callbacks).
  // The SDK uses both thrown errors AND console.error for its abort path, so we need to
  // intercept both window error events and console.error calls.
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: ErrorEvent) => {
      if (destroyedRef.current && (
        e.message?.includes("unreachable") ||
        e.message?.includes("Aborted") ||
        e.message?.includes("function signature mismatch") ||
        e.filename?.includes("shenai_sdk")
      )) {
        e.preventDefault();
      }
    };
    const rejectionHandler = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message || String(e.reason || "");
      if (destroyedRef.current && (
        msg.includes("unreachable") ||
        msg.includes("Aborted") ||
        msg.includes("shenai")
      )) {
        e.preventDefault();
      }
    };
    // Patch console.error to swallow WASM abort messages after cleanup
    const origConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      const msg = args.map(a => String(a)).join(" ");

      // Agora RTM presence can log this even when message delivery is working.
      // This client only uses RTM messaging here, not presence collection state.
      if (
        msg.includes("joinPresenceColl error") &&
        msg.includes("Presence service not connected")
      ) {
        return;
      }

      if (destroyedRef.current) {
        if (msg.includes("Aborted") || msg.includes("unreachable") ||
            msg.includes("shenai") || msg.includes("RuntimeError") ||
            msg.includes("Error ingesting") || msg.includes("Error reading frame") ||
            msg.includes("table index is out of bounds") || msg.includes("postMessage")) {
          return; // swallow
        }
      }
      origConsoleError.apply(console, args);
    };
    // Use capture phase to intercept before Next.js dev overlay
    window.addEventListener("error", handler, true);
    window.addEventListener("unhandledrejection", rejectionHandler, true);
    return () => {
      window.removeEventListener("error", handler, true);
      window.removeEventListener("unhandledrejection", rejectionHandler, true);
      console.error = origConsoleError;
    };
  }, [enabled]);

  // Shared cleanup helper — stop polling and release SDK reference.
  // We intentionally do NOT call deinitialize() or destroyRuntime() because:
  // - deinitialize() triggers async internal teardown (workers, setTimeout callbacks)
  // - Those async callbacks then hit torn-down WASM memory and throw RuntimeError
  // - The thrown error triggers the Next.js dev error overlay (can't be suppressed)
  // Instead we just null the ref and stop polling. The WASM instance gets GC'd
  // once all internal references (timers, workers) finish and release it.
  const cleanupSdk = useCallback(() => {
    destroyedRef.current = true;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    sdkRef.current = null;
  }, []);

  // Load the SDK
  useEffect(() => {
    if (!enabled || loadStartedRef.current) return;
    loadStartedRef.current = true;
    destroyedRef.current = false;

    (async () => {
      try {
        const t0 = performance.now();
        console.log("[Shen] Loading SDK module from /shenai-sdk/index.mjs...");
        // Load from root /shenai-sdk/ (served by nginx alias with correct
        // MIME types and COOP/COEP headers). Using the basePath proxy breaks
        // Emscripten pthread workers.
        const sdkModule = await import(
          /* webpackIgnore: true */ "/shenai-sdk/index.mjs"
        );
        console.log(`[Shen] SDK module imported (${Math.round(performance.now() - t0)}ms)`);
        const LoadSDK = sdkModule.default;
        const t1 = performance.now();
        console.log("[Shen] Initializing WASM runtime...");
        const sdk = await LoadSDK({
          enableErrorReporting: false,
          enablePreloadDisplay: false,
          onRuntimeInitialized: () => {
            console.log(`[Shen] WASM runtime initialized (${Math.round(performance.now() - t1)}ms)`);
          },
        });
        console.log(`[Shen] SDK ready (total ${Math.round(performance.now() - t0)}ms)`);
        sdkRef.current = sdk;
        setState((s) => ({ ...s, sdkLoaded: true }));
      } catch (err) {
        console.error("[Shen] Failed to load SDK:", err);
      }
    })();

    return () => {
      cleanupSdk();
      loadStartedRef.current = false;
    };
  }, [enabled, cleanupSdk]);

  // Initialize SDK when loaded + canvas available
  const initialize = useCallback(() => {
    const sdk = sdkRef.current;
    if (!sdk || !apiKey || sdk.isInitialized()) return;

    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.log(`[Shen] Canvas #${canvasId} not found, retrying in 200ms...`);
      setTimeout(initialize, 200);
      return;
    }

    console.log(`[Shen] Canvas found, calling sdk.initialize()...`);
    const tInit = performance.now();
    sdk.initialize(
      apiKey,
      "",
      {
        initializationMode: sdk.InitializationMode.MEASUREMENT,
        precisionMode: sdk.PrecisionMode.STRICT,
        operatingMode: sdk.OperatingMode.MEASURE,
        measurementPreset: sdk.MeasurementPreset.THIRTY_SECONDS_ALL_METRICS,
        cameraMode: sdk.CameraMode.FACING_USER,
        cameraAspectRatio: 16 / 9,
        onboardingMode: sdk.OnboardingMode.SKIP,
        showUserInterface: false,
        showFacePositioningOverlay: true,
        showVisualWarnings: false,
        enableCameraSwap: false,
        showFaceMask: true,
        showBloodFlow: true,
        hideShenaiLogo: true,
        enableStartAfterSuccess: true,
        enableSummaryScreen: false,
        enableHealthRisks: false,
        showDisclaimer: false,
        showInfoButton: false,
        showStartStopButton: false,
        showSignalQualityIndicator: false,
        showSignalTile: false,
        blockingMeasurementConditions: [],
        warningMeasurementConditions: [],
        enableFullFrameProcessing: false,
        language: "auto",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (res: any) => {
        console.log(`[Shen] Initialize callback: result=${res} OK=${sdk.InitializationResult?.OK} (${Math.round(performance.now() - tInit)}ms)`);
        if (res === sdk.InitializationResult.OK) {
          sdk.attachToCanvas(`#${canvasId}`);
          console.log(`[Shen] Attached to canvas #${canvasId} — camera should be visible now`);
          setState((s) => ({ ...s, initialized: true }));
        } else {
          console.error("[Shen] Initialization failed:", res);
        }
      },
    );
  }, [apiKey, canvasId]);

  // Trigger initialization when SDK is loaded
  useEffect(() => {
    if (state.sdkLoaded && !state.initialized) {
      initialize();
    }
  }, [state.sdkLoaded, state.initialized, initialize]);

  // Poll SDK state
  useEffect(() => {
    if (!state.initialized || !sdkRef.current) return;

    pollRef.current = setInterval(() => {
      if (destroyedRef.current) return;
      const sdk = sdkRef.current;
      if (!sdk) return;
      try { if (!sdk.isInitialized()) return; } catch { return; }

      try {
        const rawFaceState = sdk.getFaceState?.();
        const faceState = String(typeof rawFaceState === "object" && rawFaceState !== null ? rawFaceState.value : rawFaceState ?? "");
        const rawMeasState = sdk.getMeasurementState?.();
        const measStateValue = typeof rawMeasState === "object" && rawMeasState !== null ? rawMeasState.value : rawMeasState;
        const measurementState = String(measStateValue ?? "");
        const progress = sdk.getMeasurementProgressPercentage?.() ?? 0;
        const hr10s = sdk.getHeartRate10s?.() ?? null;
        const realtimeHr = sdk.getRealtimeHeartRate?.() ?? null;
        const hrvSdnn = sdk.getRealtimeHrvSdnn?.() ?? null;
        const stressIndex = sdk.getRealtimeCardiacStress?.() ?? null;
        const signalQuality = sdk.getCurrentSignalQualityMetric?.() ?? null;
        // Final results (only after measurement completes)
        const fullResults = sdk.getMeasurementResults?.() ?? null;
        // Realtime metrics (available during measurement, 30s rolling window)
        const realtimeMetrics = sdk.getRealtimeMetrics?.(30) ?? null;

        // Track face state changes
        if (faceState !== lastFaceStateRef.current) {
          lastFaceStateRef.current = faceState;
        }

        // Use new value if available, otherwise keep last known value
        const keep = lastVitalsRef.current;
        const heartRate = hr10s ?? keep.heartRate ?? null;
        const currentHrvSdnn = hrvSdnn ?? keep.hrvSdnn ?? null;
        const currentStressIndex = stressIndex ?? keep.stressIndex ?? null;
        const currentBreathingRate = realtimeMetrics?.breathing_rate_bpm ?? fullResults?.breathing_rate_bpm ?? keep.breathingRate ?? null;
        const currentSystolicBP = realtimeMetrics?.systolic_blood_pressure_mmhg ?? fullResults?.systolic_blood_pressure_mmhg ?? keep.systolicBP ?? null;
        const currentDiastolicBP = realtimeMetrics?.diastolic_blood_pressure_mmhg ?? fullResults?.diastolic_blood_pressure_mmhg ?? keep.diastolicBP ?? null;
        const currentCardiacWorkload = realtimeMetrics?.cardiac_workload_mmhg_per_sec ?? fullResults?.cardiac_workload_mmhg_per_sec ?? keep.cardiacWorkload ?? null;
        const currentSignalQuality = signalQuality ?? keep.signalQuality ?? null;
        const currentRealtimeHr = realtimeHr ?? keep.realtimeHr ?? null;

        // Build results from final results OR realtime metrics (whichever is available)
        const src = fullResults ?? realtimeMetrics;
        const newResults = src
          ? {
              heart_rate_bpm: src.heart_rate_bpm ?? keep.results?.heart_rate_bpm ?? null,
              hrv_sdnn_ms: src.hrv_sdnn_ms ?? keep.results?.hrv_sdnn_ms ?? null,
              stress_index: src.stress_index ?? keep.results?.stress_index ?? null,
              breathing_rate_bpm: src.breathing_rate_bpm ?? keep.results?.breathing_rate_bpm ?? null,
              systolic_bp: src.systolic_blood_pressure_mmhg ?? keep.results?.systolic_bp ?? null,
              diastolic_bp: src.diastolic_blood_pressure_mmhg ?? keep.results?.diastolic_bp ?? null,
              cardiac_workload: src.cardiac_workload_mmhg_per_sec ?? keep.results?.cardiac_workload ?? null,
              signal_quality: src.average_signal_quality ?? keep.results?.signal_quality ?? null,
              age_years: src.age_years ?? keep.results?.age_years ?? null,
            }
          : keep.results ?? null;

        const newState: ShenState = {
          sdkLoaded: true,
          initialized: true,
          faceState,
          measurementState,
          progress,
          heartRate,
          hrvSdnn: currentHrvSdnn,
          stressIndex: currentStressIndex,
          breathingRate: currentBreathingRate,
          systolicBP: currentSystolicBP,
          diastolicBP: currentDiastolicBP,
          cardiacWorkload: currentCardiacWorkload,
          signalQuality: currentSignalQuality,
          realtimeHr: currentRealtimeHr,
          results: newResults,
        };

        // Save latest non-null values for persistence
        lastVitalsRef.current = newState;
        setState(newState);

        // Auto-restart measurement if it completed or failed
        // MeasurementState enum: NOT_STARTED=0, WAITING_FOR_FACE=1,
        // RUNNING_SIGNAL_SHORT=2, RUNNING_SIGNAL_GOOD=3, RUNNING_SIGNAL_BAD=4,
        // RUNNING_SIGNAL_BAD_DEVICE_UNSTABLE=5, FINISHED=6, FAILED=7
        const prevMeasState = lastMeasurementStateRef.current;
        lastMeasurementStateRef.current = measurementState;
        const isFinished = measurementState === "6" || measurementState === "7" ||
          measurementState === "0"; // NOT_STARTED after auto-stop
        if (prevMeasState !== measurementState && isFinished && prevMeasState !== "") {
          setTimeout(() => {
            if (destroyedRef.current) return;
            try {
              if (sdkRef.current?.isInitialized?.()) {
                sdkRef.current.resetMeasurementSession?.();
                sdkRef.current.setOperatingMode?.(sdkRef.current.OperatingMode.MEASURE);
                sdkRef.current.startMeasurement?.();
              }
            } catch (e) {
              console.error("[Shen] Failed to restart measurement:", e);
            }
          }, 2000);
        }

        // Publish vitals via RTM at most every 2 seconds
        const now = Date.now();
        if (
          rtmPublishRef.current &&
          now - lastPublishRef.current >= 2000 &&
          (realtimeHr !== null || hr10s !== null)
        ) {
          lastPublishRef.current = now;
          const msg = JSON.stringify({
            object: "shen.vitals",
            heart_rate_bpm: heartRate,
            hrv_sdnn_ms: currentHrvSdnn,
            stress_index: currentStressIndex,
            breathing_rate_bpm: currentBreathingRate,
            systolic_bp: currentSystolicBP,
            diastolic_bp: currentDiastolicBP,
            cardiac_workload: currentCardiacWorkload,
            age_years: newResults?.age_years ?? null,
            realtime_hr: currentRealtimeHr,
            signal_quality: currentSignalQuality,
            measurement_state: measurementState,
            progress,
            _server_ts: now,
            timestamp: new Date().toISOString(),
          });
          rtmPublishRef.current(msg).catch((err: unknown) => {
            console.error("[Shen] RTM publish error:", err);
          });
        }
      } catch (err) {
        console.error("[Shen] Poll error:", err);
      }
    }, 500);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [state.initialized]);

  // Reset when disabled
  useEffect(() => {
    if (!enabled) {
      cleanupSdk();
      setState(EMPTY_STATE);
      loadStartedRef.current = false;
    }
  }, [enabled, cleanupSdk]);

  return state;
}
