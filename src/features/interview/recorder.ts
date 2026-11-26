import { useCallback, useEffect, useRef, useState } from "react";

const MIME = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/** Запись с микрофона: MediaRecorder + уровень громкости для индикатора. */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const ctx = useRef<AudioContext | null>(null);
  const done = useRef<((b: Blob) => void) | null>(null);
  const started = useRef(0);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close();
    ctx.current = null;
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const mimeType = MIME.find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(s, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        cleanup();
        done.current?.(blob);
      };
      r.start(1000);
      rec.current = r;
      started.current = performance.now();
      setSeconds(0);
      setRecording(true);

      const ac = new AudioContext();
      ctx.current = ac;
      const an = ac.createAnalyser();
      an.fftSize = 512;
      ac.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        setSeconds(Math.floor((performance.now() - started.current) / 1000));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      cleanup();
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Нет доступа к микрофону — разреши его в настройках браузера"
          : `Микрофон недоступен: ${(e as Error).message}`,
      );
    }
  }, [cleanup]);

  const stop = useCallback(
    () =>
      new Promise<Blob>((resolve) => {
        done.current = resolve;
        setRecording(false);
        rec.current?.stop();
      }),
    [],
  );

  const cancel = useCallback(() => {
    done.current = null;
    setRecording(false);
    if (rec.current?.state === "recording") rec.current.stop();
    cleanup();
  }, [cleanup]);

  return { recording, seconds, level, error, start, stop, cancel };
}

export function speak(text: string, lang: "ru" | "en") {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "en" ? "en-US" : "ru-RU";
  u.rate = 1.02;
  speechSynthesis.speak(u);
}
