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
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setInView(true);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) finish();
        } else if (!once) setInView(false);
      },
      { threshold, rootMargin },
    );
    // Rolagem rápida pode pular a interseção: revela o que já passou ou está na tela.
    let frame = 0;
    const check = () => {
      frame = 0;
      if (node.getBoundingClientRect().top < window.innerHeight) finish();
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    observer.observe(node);
    if (once) {
      window.addEventListener("scroll", onScroll, { passive: true });
      check();
    }
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
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
  const [ref, inView] = useInViewport<HTMLElement>({
    threshold: 0.05,
    rootMargin: "0px 0px -6% 0px",
  });
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

/* Pétalas: 3 formatos orgânicos. tone: 0 verde suave, 1 verde-acinzentado, 2 off-white.
   depth 0 = distante (menor, desfocada, mais transparente). Os 5 primeiros aparecem no mobile. */
const PETAL_SHAPES = [
  // pétala em gota com nervura
  { d: "M12 2C18 7 20 14 12 22C4 14 6 7 12 2Z", vein: "M12 5C12.6 10 12.4 15 12 20" },
  // folha alongada curva
  { d: "M3 21C3 11 10 4 21 3C20 13 13 20 3 21Z", vein: "M4.5 19.5C9 15 13 10 18 5.5" },
  // pétala arredondada com entalhe (cerejeira)
  { d: "M12 22C6 18 3 12 5 6.5C7 3 10 3.5 12 6.5C14 3.5 17 3 19 6.5C21 12 18 18 12 22Z", vein: "M12 9C12 13 12 17 12 20" },
];
const PETALS = [
  { left: 7, delay: 2.1, dur: 16, size: 20, sway: 46, shape: 0, tone: 0, depth: 2 },
  { left: 31, delay: 9.4, dur: 19, size: 15, sway: -38, shape: 2, tone: 2, depth: 1 },
  { left: 55, delay: 5.2, dur: 14, size: 24, sway: 54, shape: 1, tone: 1, depth: 2 },
  { left: 78, delay: 13.6, dur: 21, size: 14, sway: -30, shape: 0, tone: 2, depth: 0 },
  { left: 92, delay: 7.7, dur: 17, size: 18, sway: 36, shape: 2, tone: 0, depth: 1 },
  { left: 18, delay: 15.3, dur: 20, size: 13, sway: 28, shape: 1, tone: 1, depth: 0 },
  { left: 43, delay: 0.8, dur: 18, size: 17, sway: -48, shape: 0, tone: 1, depth: 1 },
  { left: 66, delay: 11.2, dur: 15, size: 22, sway: 40, shape: 2, tone: 0, depth: 2 },
  { left: 85, delay: 3.9, dur: 22, size: 12, sway: -24, shape: 1, tone: 2, depth: 0 },
  { left: 24, delay: 6.6, dur: 13, size: 26, sway: -56, shape: 1, tone: 0, depth: 2 },
  { left: 49, delay: 17.1, dur: 21, size: 14, sway: 30, shape: 2, tone: 1, depth: 0 },
  { left: 72, delay: 8.8, dur: 17, size: 16, sway: -36, shape: 0, tone: 2, depth: 1 },
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
      {PETALS.map((p, i) => {
        const shape = PETAL_SHAPES[p.shape];
        return (
          <span
            key={i}
            className={`fx-petal tone-${p.tone} depth-${p.depth} ${i >= 5 ? "desktop-only" : ""}`}
            style={
              {
                left: `${p.left}%`,
                "--petal-delay": `${-p.delay}s`,
                "--petal-dur": `${p.dur}s`,
                "--petal-size": `${p.size}px`,
                "--petal-sway": `${p.sway}px`,
                "--petal-sway-dur": `${(p.dur / 3.2).toFixed(2)}s`,
                "--petal-spin-dur": `${(p.dur / 2.4).toFixed(2)}s`,
              } as CSSProperties
            }
          >
            <span className="fx-petal-sway">
              <svg className="fx-petal-spin" viewBox="0 0 24 24" width="100%" height="100%">
                <path className="fx-petal-body" d={shape.d} />
                <path className="fx-petal-vein" d={shape.vein} />
              </svg>
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Índice que avança em loop lento; pausa fora da viewport, com aba oculta e em reduced-motion. */
export function useLoopStep<T extends Element>(count: number, interval = 2400) {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInViewport<T>({ once: false, threshold: 0.1 });
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (reduced || !inView) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % count);
    }, interval);
    return () => clearInterval(timer);
  }, [reduced, inView, count, interval]);
  return [ref, index, inView && !reduced] as const;
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
