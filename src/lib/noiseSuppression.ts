// RNNoise-based ML noise suppression for the outgoing mic track.
//
// The browser-native `noiseSuppression` constraint is weak everywhere and
// near-useless inside Android WebView — toggling it via applyConstraints()
// is frequently a silent no-op on a live track. This module routes the raw
// mic track through the RNNoise recurrent neural network (the same model
// family Discord/Jitsi use) compiled to WASM, running in an AudioWorklet:
//
//   raw mic track → MediaStreamSource → RnnoiseWorkletNode → MediaStreamDestination
//                                                                  ↓
//                                              processed track → RTCPeerConnection
//
// Toggling suppression re-wires the graph (source→rnnoise→dest vs
// source→dest) without renegotiation: peers keep receiving the same track.
//
// RNNoise expects 48 kHz input — the AudioContext is pinned to 48 kHz and
// the source node resamples if the capture device disagrees.

import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

export type NoiseSuppressionPipeline = {
  /** The denoised track — add THIS to peer connections, not the raw track. */
  processedTrack: MediaStreamTrack;
  /** Re-wires the graph; instant, no renegotiation needed. */
  setEnabled(on: boolean): void;
  isEnabled(): boolean;
  /** Tears down the worklet + AudioContext. Does NOT stop the raw input track. */
  dispose(): Promise<void>;
};

// The wasm binary is ~200 KB — fetch once per session, share across calls.
let wasmBinaryPromise: Promise<ArrayBuffer> | null = null;
function getWasmBinary(): Promise<ArrayBuffer> {
  if (!wasmBinaryPromise) {
    wasmBinaryPromise = loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl })
      .catch((err) => {
        wasmBinaryPromise = null; // allow retry on next call
        throw err;
      });
  }
  return wasmBinaryPromise;
}

/**
 * Build the processing pipeline for a raw mic track. Throws if the platform
 * lacks AudioWorklet/WASM support or the assets fail to load — callers must
 * fall back to sending the raw track.
 */
export async function createNoiseSuppressionPipeline(
  rawTrack: MediaStreamTrack,
  initiallyEnabled: boolean,
): Promise<NoiseSuppressionPipeline> {
  const ctx = new AudioContext({ sampleRate: 48_000 });
  try {
    const [wasmBinary] = await Promise.all([
      getWasmBinary(),
      ctx.audioWorklet.addModule(rnnoiseWorkletUrl),
    ]);

    const source = ctx.createMediaStreamSource(new MediaStream([rawTrack]));
    const rnnoise = new RnnoiseWorkletNode(ctx, { maxChannels: 2, wasmBinary });
    const destination = ctx.createMediaStreamDestination();

    let enabled = initiallyEnabled;
    const wire = () => {
      source.disconnect();
      rnnoise.disconnect();
      if (enabled) {
        source.connect(rnnoise);
        rnnoise.connect(destination);
      } else {
        source.connect(destination);
      }
    };
    wire();

    // Joining a call is a user gesture, so resume() should always succeed —
    // but autoplay policy can still leave a fresh context suspended on mobile.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

    const processedTrack = destination.stream.getAudioTracks()[0];
    if (!processedTrack) throw new Error('destination produced no audio track');

    return {
      processedTrack,
      setEnabled(on: boolean) {
        if (on === enabled) return;
        enabled = on;
        wire();
      },
      isEnabled: () => enabled,
      async dispose() {
        try { rnnoise.destroy(); } catch { /* already destroyed */ }
        try { await ctx.close(); } catch { /* already closed */ }
      },
    };
  } catch (err) {
    try { await ctx.close(); } catch { /* ignore */ }
    throw err;
  }
}
