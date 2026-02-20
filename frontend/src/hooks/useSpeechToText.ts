import { useEffect, useMemo, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: null | (() => void);
  onend: null | (() => void);
  onerror: null | ((e: any) => void);
  onresult: null | ((e: any) => void);
  start: () => void;
  stop: () => void;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useSpeechToText(opts?: { lang?: string }) {
  const lang = opts?.lang ?? "zh-CN";
  const Ctor = useMemo(() => getSpeechRecognitionCtor(), []);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const [supported] = useState<boolean>(() => Boolean(Ctor));
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onFinalTextRef = useRef<(text: string) => void>(() => {});
  function setOnFinalText(cb: (text: string) => void) {
    onFinalTextRef.current = cb;
  }

  useEffect(() => {
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => {
      setError(null);
      setListening(true);
    };

    rec.onend = () => {
      setListening(false);
      setInterim("");
    };

    rec.onerror = (e: any) => {
      setError(e?.error || e?.message || "speech_error");
    };

    rec.onresult = (e: any) => {
      let finalText = "";
      let interimText = "";

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const txt = res[0]?.transcript ?? "";
        if (res.isFinal) finalText += txt;
        else interimText += txt;
      }

      if (finalText.trim()) onFinalTextRef.current(finalText);
      setInterim(interimText);
    };

    recRef.current = rec;
    return () => {
      try { rec.stop(); } catch {}
      recRef.current = null;
    };
  }, [Ctor, lang]);

  function start() {
    if (!recRef.current) return;
    setError(null);
    try { recRef.current.start(); } catch (e: any) { setError(e?.message || String(e)); }
  }

  function stop() {
    if (!recRef.current) return;
    try { recRef.current.stop(); } catch {}
  }

  return { supported, listening, interim, error, start, stop, setOnFinalText };
}
