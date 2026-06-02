export async function recordWav(durationMs, onTick) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone recording is not supported in this browser.");
  }
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Audio recording is not supported in this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "";
  const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];

  return new Promise((resolve, reject) => {
    let tickTimer = null;
    const startedAt = Date.now();

    const cleanup = () => {
      if (tickTimer) clearInterval(tickTimer);
      stream.getTracks().forEach((track) => track.stop());
    };

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    mediaRecorder.onerror = () => {
      cleanup();
      reject(new Error("Recording failed."));
    };

    mediaRecorder.onstop = async () => {
      cleanup();
      try {
        const sourceBlob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
        const arrayBuffer = await sourceBlob.arrayBuffer();
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw new Error("Audio processing is not supported in this browser.");
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const resampled = await resampleTo16k(audioBuffer);
        const wavBlob = audioBufferToWavBlob(resampled);
        await audioContext.close();
        resolve(wavBlob);
      } catch {
        reject(new Error("Could not convert the recording to WAV."));
      }
    };

    mediaRecorder.start();
    tickTimer = setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      onTick?.(Math.min(elapsedMs / durationMs, 1));
    }, 100);

    setTimeout(() => {
      if (mediaRecorder.state === "recording") mediaRecorder.stop();
    }, durationMs);
  });
}

/**
 * Acquire the microphone stream once so it can be reused across multiple
 * recordings (avoids the per-sample latency of repeated getUserMedia calls).
 */
export async function acquireMicStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone recording is not supported in this browser.");
  }
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}

/** Stop all tracks on a previously acquired stream. */
export function releaseMicStream(stream) {
  if (stream) stream.getTracks().forEach((t) => t.stop());
}

/**
 * Record a single WAV clip using an already-open mic stream.
 * The audio is downsampled to 16 kHz to match the backend's expected sample rate.
 *
 * @param {MediaStream} stream   - An open mic stream from acquireMicStream()
 * @param {number}      durationMs
 * @param {Function}   [onTick] - progress callback (0–1)
 * @returns {Promise<Blob>}      WAV blob at 16 kHz
 */
export function recordWavWithStream(stream, durationMs, onTick) {
  return new Promise((resolve, reject) => {
    if (typeof MediaRecorder === "undefined") {
      return reject(new Error("MediaRecorder is not supported in this browser."));
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    let tickTimer = null;
    const startedAt = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onerror = () => {
      if (tickTimer) clearInterval(tickTimer);
      reject(new Error("Recording failed."));
    };

    recorder.onstop = async () => {
      if (tickTimer) clearInterval(tickTimer);
      try {
        const srcBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const arrayBuffer = await srcBlob.arrayBuffer();
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw new Error("AudioContext not supported.");
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(arrayBuffer);
        // Resample to 16 kHz — matches backend SAMPLE_RATE
        const resampled = await resampleTo16k(decoded);
        const wavBlob = audioBufferToWavBlob(resampled);
        await ctx.close();
        resolve(wavBlob);
      } catch (err) {
        reject(new Error("Could not convert the recording to WAV: " + (err?.message || err)));
      }
    };

    recorder.start();
    tickTimer = setInterval(() => {
      onTick?.(Math.min((Date.now() - startedAt) / durationMs, 1));
    }, 100);

    setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, durationMs);
  });
}

/**
 * Resample an AudioBuffer to 16 000 Hz using OfflineAudioContext.
 */
async function resampleTo16k(audioBuffer) {
  const TARGET_SR = 16000;
  if (audioBuffer.sampleRate === TARGET_SR) return audioBuffer;

  const offlineCtx = new OfflineAudioContext(
    1,                                                      // mono
    Math.ceil(audioBuffer.duration * TARGET_SR),
    TARGET_SR
  );
  const src = offlineCtx.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(offlineCtx.destination);
  src.start(0);
  return offlineCtx.startRendering();
}

function audioBufferToWavBlob(audioBuffer) {
  const channelCount = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const sampleCount = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = sampleCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const channels = Array.from({ length: channelCount }, (_, index) => audioBuffer.getChannelData(index));
  for (let i = 0; i < sampleCount; i += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
