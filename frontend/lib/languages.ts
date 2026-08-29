/**
 * Language list for the builder.
 *
 * The backend's app/config/voice_profiles.py is the source of truth. This file
 * is a static fallback so the dropdown renders instantly and still works if the
 * backend is down; `fetchLanguages()` refreshes it from GET /config/languages on
 * mount, so adding a language stays a one-file change on the backend.
 *
 * There is deliberately no provider or voice picker anywhere in the UI: STT
 * vendor, TTS vendor, model and voice are all derived from the language.
 */

export interface VoiceOption {
  id: string;
  label: string;
  gender: string;
}

export interface LanguageOption {
  code: string;
  label: string;
  sttVendor: string;
  sttModel: string;
  ttsVendor: string;
  ttsModel: string;
  voices: VoiceOption[];
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export const DEFAULT_LANGUAGE = 'en-US';

// Trimmed mirror of the backend registry - codes and labels must match; the
// voice arrays only need the first entry or two, since this copy is replaced by
// the real one as soon as fetchLanguages() returns.
export const FALLBACK_LANGUAGES: LanguageOption[] = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'es-ES', label: 'Spanish' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'pt-PT', label: 'Portuguese' },
  { code: 'it-IT', label: 'Italian' },
  { code: 'nl-NL', label: 'Dutch' },
  { code: 'ru-RU', label: 'Russian' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'ko-KR', label: 'Korean' },
  { code: 'zh-CN', label: 'Chinese (Mandarin)' },
  { code: 'ar-SA', label: 'Arabic' },
  { code: 'tr-TR', label: 'Turkish' },
  { code: 'id-ID', label: 'Indonesian' },
  { code: 'vi-VN', label: 'Vietnamese' },
  { code: 'th-TH', label: 'Thai' },
].map((l) => ({
  ...l,
  sttVendor: 'deepgram',
  sttModel: 'nova-3',
  ttsVendor: 'minimax',
  ttsModel: 'speech-2.6-turbo',
  voices: [],
}));

export async function fetchLanguages(): Promise<LanguageOption[]> {
  const res = await fetch(`${BACKEND_URL}/config/languages`);
  if (!res.ok) throw new Error(`GET /config/languages failed: ${res.status}`);
  const data = await res.json();
  return data.languages as LanguageOption[];
}

export function languageLabel(code: string, languages: LanguageOption[]): string {
  return languages.find((l) => l.code === code)?.label ?? code;
}

/**
 * Mirrors assign_voices() in voice_profiles.py: agent N in panel order gets
 * voice N in the language's pool, wrapping if the panel is bigger than the pool.
 * Used only to show the user which voice an agent will speak with - the backend
 * recomputes this independently and its answer is the one that runs.
 */
export function previewVoice(
  agentIndex: number,
  language: LanguageOption | undefined,
): VoiceOption | null {
  if (!language || language.voices.length === 0) return null;
  return language.voices[agentIndex % language.voices.length];
}
