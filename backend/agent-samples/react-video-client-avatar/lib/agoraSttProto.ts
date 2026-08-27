import { Root, type Type } from "protobufjs/light";

type AgoraSttWord = {
  text?: string;
  isFinal?: boolean;
};

type AgoraSttText = {
  uid?: number | string;
  time?: number | string | { toNumber?: () => number };
  lang?: number | string;
  words?: AgoraSttWord[];
  data_type?: string;
  end_of_segment?: boolean;
};

export type MeetingTranscriptLine = {
  uid: string;
  time: string;
  text: string;
  source_lang: string;
};

const root = Root.fromJSON({
  nested: {
    agora: {
      nested: {
        audio2text: {
          nested: {
            Text: {
              fields: {
                vendor: { type: "int32", id: 1 },
                version: { type: "int32", id: 2 },
                seqnum: { type: "int32", id: 3 },
                uid: { type: "uint32", id: 4 },
                flag: { type: "int32", id: 5 },
                time: { type: "int64", id: 6 },
                lang: { type: "int32", id: 7 },
                starttime: { type: "int32", id: 8 },
                offtime: { type: "int32", id: 9 },
                words: { rule: "repeated", type: "Word", id: 10 },
                end_of_segment: { type: "bool", id: 11 },
                duration_ms: { type: "int32", id: 12 },
                data_type: { type: "string", id: 13 },
                trans: { rule: "repeated", type: "Translation", id: 14 },
              },
            },
            Word: {
              fields: {
                text: { type: "string", id: 1 },
                startMs: { type: "int32", id: 2 },
                durationMs: { type: "int32", id: 3 },
                isFinal: { type: "bool", id: 4 },
                confidence: { type: "double", id: 5 },
              },
            },
            Translation: {
              fields: {
                isFinal: { type: "bool", id: 1 },
                lang: { type: "string", id: 2 },
                texts: { rule: "repeated", type: "string", id: 3 },
              },
            },
          },
        },
      },
    },
  },
});

function resolveTextType(): Type {
  try {
    return root.lookupType("agora.audio2text.Text") as Type;
  } catch {
    return root.lookupType("Text") as Type;
  }
}

const textType = resolveTextType();

function toUint8Array(data: Uint8Array | ArrayBuffer): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function toIsoTime(value: AgoraSttText["time"]): string {
  if (value == null) return new Date().toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
  }
  if (typeof value === "object" && typeof value.toNumber === "function") {
    return new Date(value.toNumber()).toISOString();
  }
  return new Date().toISOString();
}

export function decodeAgoraSttStreamMessage(data: Uint8Array | ArrayBuffer): AgoraSttText | null {
  try {
    return textType.decode(toUint8Array(data)) as unknown as AgoraSttText;
  } catch {
    return null;
  }
}

export function extractFinalTranscriptLine(
  data: Uint8Array | ArrayBuffer,
): MeetingTranscriptLine | null {
  const msg = decodeAgoraSttStreamMessage(data);
  if (!msg || msg.data_type !== "transcribe" || !Array.isArray(msg.words) || !msg.words.length) {
    return null;
  }

  const text = msg.words
    .map((word) => (typeof word?.text === "string" ? word.text : ""))
    .join("")
    .trim();
  if (!text) return null;

  const hasFinal = msg.words.some((word) => word?.isFinal === true) || msg.end_of_segment === true;
  if (!hasFinal) return null;

  return {
    uid: String(msg.uid ?? ""),
    time: toIsoTime(msg.time),
    text,
    source_lang: msg.lang != null ? String(msg.lang) : "",
  };
}
