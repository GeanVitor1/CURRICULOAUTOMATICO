/* Primitivas de motion leves (sem dependências). Animam apenas transform/opacity
   e respeitam prefers-reduced-motion. O texto real permanece no DOM. */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  type PointerEvent,
} from "react";

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReduced(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

/** Observa a visibilidade. `once` congela em true após a primeira entrada. */
export function useInViewport<T extends Element>(
  options: { once?: boolean; threshold?: number; rootMargin?: string } = {},
) {
  const { once = true, threshold = 0.15, rootMargin = "0px" } = options;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) setInView(false);
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [once, threshold, rootMargin]);
  return [ref, inView] as const;
}

export function Reveal({
  as: Tag = "div",
  children,
  className = "",
  delay = 0,
  style,
  ...rest
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  delay?: number;
  style?: CSSProperties;
  [key: string]: unknown;
}) {
  const [ref, inView] = useInViewport<HTMLElement>({ threshold: 0.12 });
  return (
    <Tag
      ref={ref}
      className={`fx-reveal ${inView ? "is-in" : ""} ${className}`}
      style={{ ...style, "--fx-delay": `${delay}ms` } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Divide o texto em palavras animadas; leitores de tela recebem o texto inteiro. */
export function SplitText({
  text,
  className = "",
  delay = 0,
  step = 70,
}: {
  text: string;
  className?: string;
  delay?: number;
  step?: number;
}) {
  const words = text.split(" ");
  return (
    <span className={`fx-split ${className}`}>
      <span className="fx-sr">{text}</span>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="fx-word"
          aria-hidden="true"
          style={{ "--fx-delay": `${delay + i * step}ms` } as CSSProperties}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

export function BlurText({
  as: Tag = "p",
  children,
  delay = 0,
  className = "",
}: {
  as?: ElementType;
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <Tag
      className={`fx-blur ${className}`}
      style={{ "--fx-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/** Conta até `value` uma única vez por valor (não reinicia em re-render). */
export function CountUp({
  value,
  duration = 900,
  format = (n: number) => n.toLocaleString("pt-BR"),
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const shown = useRef(value);
  const first = useRef(true);
  useEffect(() => {
    const from = first.current ? 0 : shown.current;
    first.current = false;
    if (reduced || !Number.isFinite(value) || from === value) {
      shown.current = value;
      setDisplay(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (value - from) * eased);
      shown.current = next;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      shown.current = value;
    };
  }, [value, duration, reduced]);
  return (
    <span className="fx-count">
      <span className="fx-sr">{format(value)}</span>
      <span aria-hidden="true">{format(display)}</span>
    </span>
  );
}

/** Spotlight: grava a posição do cursor em variáveis CSS (sem re-render). */
export function spotlightHandler(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== "mouse") return;
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
}

/** Folhas/pétalas caindo. Posições determinísticas, pausa fora da viewport. */
const PETALS = [
  { left: 6, delay: 0, dur: 14, size: 14, drift: 40, kind: 0 },
  { left: 18, delay: 5.5, dur: 17, size: 11, drift: -30, kind: 1 },
  { left: 29, delay: 2.2, dur: 15, size: 16, drift: 50, kind: 0 },
  { left: 41, delay: 8.4, dur: 19, size: 10, drift: -45, kind: 1 },
  { left: 53, delay: 3.6, dur: 16, size: 13, drift: 35, kind: 0 },
  { left: 64, delay: 10.1, dur: 18, size: 12, drift: -25, kind: 1 },
  { left: 75, delay: 1.3, dur: 15, size: 15, drift: 30, kind: 0 },
  { left: 86, delay: 6.8, dur: 20, size: 11, drift: -40, kind: 1 },
  { left: 94, delay: 12.2, dur: 17, size: 13, drift: 20, kind: 0 },
  { left: 12, delay: 9.3, dur: 21, size: 9, drift: 25, kind: 1 },
];

export function FallingPetals() {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInViewport<HTMLDivElement>({ once: false, threshold: 0 });
  if (reduced) return null;
  return (
    <div
      ref={ref}
      className={`fx-petals ${inView ? "" : "is-paused"}`}
      aria-hidden="true"
    >
      {PETALS.map((p, i) => (
        <span
          key={i}
          className={`fx-petal ${i >= 4 ? "desktop-only" : ""}`}
          style={
            {
              left: `${p.left}%`,
              "--petal-delay": `${-p.delay}s`,
              "--petal-dur": `${p.dur}s`,
              "--petal-size": `${p.size}px`,
              "--petal-drift": `${p.drift}px`,
            } as CSSProperties
          }
        >
          <svg viewBox="0 0 20 20" width="100%" height="100%">
            {p.kind === 0 ? (
              <path d="M10 1C15 5 17 11 10 19C3 11 5 5 10 1Z" fill="currentColor" />
            ) : (
              <path
                d="M3 17C3 8 9 3 18 2C17 11 12 17 3 17Z M3 17L12 8"
                fill="currentColor"
                stroke="var(--eg-green-soft)"
                strokeWidth="0.8"
              />
            )}
          </svg>
        </span>
      ))}
    </div>
  );
}

/** Progresso de scroll (0–1) de um elemento atravessando a viewport. */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const raw = (vh * 0.85 - rect.top) / (rect.height + vh * 0.35);
      setProgress(Math.max(0, Math.min(1, raw)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return [ref, progress] as const;
}
