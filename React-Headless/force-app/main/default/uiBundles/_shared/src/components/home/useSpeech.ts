import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Thin wrapper over the browser SpeechSynthesis API. `toggle(text)` starts
 * speaking, or stops if already speaking. Guards unsupported browsers
 * (`supported:false` — the caller should toast). Cancels on unmount.
 */
export function useSpeech(): {
  supported: boolean;
  speaking: boolean;
  toggle: (text: string) => void;
  stop: () => void;
} {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const toggle = useCallback(
    (text: string) => {
      if (!supported) return;
      if (window.speechSynthesis.speaking) {
        stop();
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      utterRef.current = u;
      window.speechSynthesis.speak(u);
      setSpeaking(true);
    },
    [supported, stop],
  );

  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  return { supported, speaking, toggle, stop };
}
