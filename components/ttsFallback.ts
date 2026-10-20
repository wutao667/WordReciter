import type { TTSEngine } from '../services/geminiService';

export interface FallbackNotice {
  from: TTSEngine;
  to: TTSEngine;
}

export const getFallbackNotice = (
  requestedEngine: TTSEngine,
  engineUsed: TTSEngine
): FallbackNotice | null => (
  engineUsed === requestedEngine
    ? null
    : { from: requestedEngine, to: engineUsed }
);
