"use client"

import { useState, useEffect, useRef } from "react"
import type { IMicrophoneAudioTrack } from "agora-rtc-sdk-ng"

export interface AudioVisualizationOptions {
  /** Minimum volume threshold (0-1) before bars start lighting up. Default: 0.15 */
  threshold?: number
  /** Number of visualization bars. Default: 24 */
  barCount?: number
  /** Volume amplification factor. Default: 4.0 */
  amplification?: number
  /** Decay rate for volume smoothing (0-1). Default: 0.95 */
  volumeDecay?: number
  /** Attack interpolation factor (0-1). Default: 0.3 */
  attackRate?: number
  /** Update interval in milliseconds. Default: 33 (30fps) */
  updateInterval?: number
}

/**
 * Hook that analyzes audio track and provides volume-based visualization data
 * Uses Web Audio API to calculate overall volume and light dots from left to right
 *
 * @param track - Agora IMicrophoneAudioTrack to analyze
 * @param enabled - Whether visualization is enabled
 * @param options - Configuration options for visualization behavior
 * @returns Array of binary values (0 or 1) for dot visualization - lights up from left to right based on volume
 *
 * @example
 * const frequencyData = useAudioVisualization(localAudioTrack, isConnected)
 * return <SimpleVisualizer data={frequencyData} />
 */
export function useAudioVisualization(
  track: IMicrophoneAudioTrack | null,
  enabled: boolean = true,
  options: AudioVisualizationOptions = {}
): number[] {
  const {
    threshold = 0.15,
    barCount = 24,
    amplification = 4.0,
    volumeDecay = 0.95,
    attackRate = 0.3,
    updateInterval = 33,
  } = options
  // Initialize with empty bars (all 0s) to show gray bars immediately
  const [frequencyData, setFrequencyData] = useState<number[]>(Array(barCount).fill(0))
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const animationIdRef = useRef<number | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const currentLitCountRef = useRef<number>(0)
  const smoothedVolumeRef = useRef<number>(0)

  useEffect(() => {
    if (!track || !enabled) {
      // Cleanup if track is removed or disabled
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
        animationIdRef.current = null
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect()
        sourceRef.current = null
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      setFrequencyData(Array(barCount).fill(0))
      currentLitCountRef.current = 0
      smoothedVolumeRef.current = 0
      return
    }

    const setupAudioAnalysis = async () => {
      try {
        // Get the MediaStreamTrack from Agora's audio track
        const mediaStreamTrack = track.getMediaStreamTrack()
        const mediaStream = new MediaStream([mediaStreamTrack])

        // Create AudioContext and AnalyserNode
        const AudioContextConstructor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const audioContext = new AudioContextConstructor()
        const analyser = audioContext.createAnalyser()

        // Configure analyser - match simple-voice-client settings
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8
        analyser.minDecibels = -100
        analyser.maxDecibels = -30

        // Connect audio source to analyser
        const source = audioContext.createMediaStreamSource(mediaStream)
        source.connect(analyser)

        // Store refs
        audioContextRef.current = audioContext
        analyserRef.current = analyser
        sourceRef.current = source

        // Buffer for frequency data
        const dataArray = new Uint8Array(analyser.frequencyBinCount)

        const updateData = () => {
          if (!analyserRef.current) return

          // Get frequency data
          analyserRef.current.getByteFrequencyData(dataArray)

          // Calculate overall volume (average of all frequencies)
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i]
          }
          const averageVolume = sum / dataArray.length

          // Normalize to 0-1 range with amplification
          let rawVolume = Math.min(1, (averageVolume / 255) * amplification)

          // Apply threshold - require minimum volume before showing anything
          if (rawVolume < threshold) {
            rawVolume = 0
          } else {
            // Scale remaining range: threshold -> 1.0 becomes 0 -> 1.0
            rawVolume = (rawVolume - threshold) / (1 - threshold)
          }

          // Smooth the volume with attack/decay
          const previousSmoothedVolume = smoothedVolumeRef.current
          const smoothedVolume =
            rawVolume > previousSmoothedVolume
              ? rawVolume // Instant attack
              : previousSmoothedVolume * volumeDecay // Slow decay
          smoothedVolumeRef.current = smoothedVolume

          // Determine how many dots should be lit based on smoothed volume
          const targetLitCount = smoothedVolume * barCount // Keep as float for smooth interpolation

          // Smooth the lit count itself to prevent flickering
          const currentLitCount = currentLitCountRef.current
          let newLitCount: number

          if (targetLitCount > currentLitCount) {
            // Quick attack - interpolate towards target
            newLitCount = currentLitCount + (targetLitCount - currentLitCount) * attackRate
          } else {
            // Slow decay
            newLitCount = currentLitCount * volumeDecay
          }

          currentLitCountRef.current = newLitCount

          // Round to integer for final display
          const displayLitCount = Math.round(newLitCount)

          // Create binary array: 1 for lit dots (left to right), 0 for unlit
          const visualizationData = Array.from({ length: barCount }, (_, i) =>
            i < displayLitCount ? 1 : 0
          )

          // Update state based on configured interval
          const now = Date.now()
          if (now - lastUpdateRef.current >= updateInterval) {
            setFrequencyData(visualizationData)
            lastUpdateRef.current = now
          }

          animationIdRef.current = requestAnimationFrame(updateData)
        }

        updateData()
      } catch (error) {
        console.error("Audio Visualization setup error:", error)
      }
    }

    setupAudioAnalysis()

    // Cleanup on unmount or track change
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect()
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close()
      }
    }
  }, [track, enabled, barCount, threshold, amplification, volumeDecay, attackRate, updateInterval])

  return frequencyData
}
