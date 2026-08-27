"use client";

import { useCallback, useEffect, useState } from "react";
import AgoraRTC from "agora-rtc-sdk-ng";

export interface AudioDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

export interface UseAudioDevicesReturn {
  devices: AudioDevice[];
  loading: boolean;
  error: string | null;
  hasPermission: boolean;
  loadDevices: () => Promise<void>;
}

export function useAudioDevices(): UseAudioDevicesReturn {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);

  const loadDevices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const microphones = await AgoraRTC.getMicrophones();

      const audioInputs = microphones.map((device) => {
        let cleanLabel =
          device.label || `Microphone ${device.deviceId.slice(0, 8)}`;
        cleanLabel = cleanLabel.replace(/\s*\([^)]*\)/g, "").trim();

        return {
          deviceId: device.deviceId,
          label: cleanLabel,
          groupId: device.groupId,
        };
      });

      setDevices(audioInputs);
      setHasPermission(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to get audio devices",
      );
      console.error("Error getting audio devices:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    AgoraRTC.onMicrophoneChanged = (info) => {
      // Microphone changed — reload device list
      loadDevices();
    };

    return () => {
      AgoraRTC.onMicrophoneChanged = undefined;
    };
  }, [loadDevices]);

  return {
    devices,
    loading,
    error,
    hasPermission,
    loadDevices,
  };
}
