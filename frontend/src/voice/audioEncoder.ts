export interface EncodedAudio {
  blob: Blob;
  durationMs: number;
}

/**
 * Converts array of Float32Array PCM chunks (mono) into a 16-bit PCM WAV Blob.
 */
export function encodeFloat32ToWav(
  audioChunks: Float32Array[],
  sampleRate: number
): EncodedAudio | null {
  if (!audioChunks || audioChunks.length === 0) {
    return null;
  }

  let totalSamples = 0;
  for (let i = 0; i < audioChunks.length; i += 1) {
    totalSamples += audioChunks[i].length;
  }

  if (totalSamples === 0) {
    return null;
  }

  const durationMs = (totalSamples / sampleRate) * 1000;

  // Ignore audio shorter than 300ms
  if (durationMs < 300) {
    return null;
  }

  // Concatenate chunks into a single Float32Array
  const mergedSamples = new Float32Array(totalSamples);
  let offset = 0;
  for (let i = 0; i < audioChunks.length; i += 1) {
    mergedSamples.set(audioChunks[i], offset);
    offset += audioChunks[i].length;
  }

  // Build 16-bit PCM WAV buffer
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, "RIFF");
  /* RIFF chunk size */
  view.setUint32(4, 36 + totalSamples * 2, true);
  /* RIFF format */
  writeString(view, 8, "WAVE");
  /* Subchunk1 ID "fmt " */
  writeString(view, 12, "fmt ");
  /* Subchunk1 size 16 for PCM */
  view.setUint32(16, 16, true);
  /* Audio format 1 (PCM) */
  view.setUint16(20, 1, true);
  /* Num channels = 1 (mono) */
  view.setUint16(22, 1, true);
  /* Sample rate */
  view.setUint32(24, sampleRate, true);
  /* Byte rate = SampleRate * NumChannels * BitsPerSample / 8 */
  view.setUint32(28, sampleRate * 2, true);
  /* Block align = NumChannels * BitsPerSample / 8 */
  view.setUint16(32, 2, true);
  /* Bits per sample = 16 */
  view.setUint16(34, 16, true);
  /* Subchunk2 ID "data" */
  writeString(view, 36, "data");
  /* Subchunk2 size */
  view.setUint32(40, totalSamples * 2, true);

  // Convert Float32 to 16-bit PCM samples
  let sampleIndex = 44;
  for (let i = 0; i < totalSamples; i += 1) {
    const sample = Math.max(-1, Math.min(1, mergedSamples[i]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(sampleIndex, int16, true);
    sampleIndex += 2;
  }

  const blob = new Blob([view], { type: "audio/wav" });
  return { blob, durationMs };
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i += 1) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
