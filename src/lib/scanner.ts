// A USB barcode scanner "types" the code very fast and presses Enter. People
// type much slower. This tells the two apart from key timings alone, so the
// register can catch a scan no matter which element has focus.

export type ScannerOptions = {
  onScan: (code: string) => void;
  minLength?: number;
  maxGapMs?: number; // the longest pause between scanner keystrokes
};

export function createScanDetector({ onScan, minLength = 4, maxGapMs = 40 }: ScannerOptions) {
  let buffer = '';
  let last = 0;

  return {
    // Returns true when the key completed a scan (the caller can then
    // preventDefault so Enter does not also submit a form).
    key(key: string, timeMs: number): boolean {
      const gap = timeMs - last;
      last = timeMs;
      if (key === 'Enter') {
        const code = buffer;
        buffer = '';
        if (code.length >= minLength) {
          onScan(code);
          return true;
        }
        return false;
      }
      if (key.length !== 1) return false;
      if (buffer && gap > maxGapMs) buffer = '';
      buffer += key;
      return false;
    },
    reset() {
      buffer = '';
    },
  };
}
