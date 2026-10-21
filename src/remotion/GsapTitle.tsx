import { useLayoutEffect, useMemo, useRef } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import gsap from "gsap";

// GSAP is driven by Remotion's frame, never by its own ticker: the timeline is
// paused and seeked to frame/fps every render so output is deterministic.
export const GsapTitle: React.FC<{ title: string }> = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ref = useRef<HTMLHeadingElement>(null);

  const tl = useMemo(() => gsap.timeline({ paused: true }), []);

  useLayoutEffect(() => {
    if (!ref.current) return;
    tl.fromTo(
      ref.current,
      { y: 80, opacity: 0, letterSpacing: "0.4em" },
      { y: 0, opacity: 1, letterSpacing: "0em", duration: 1.2, ease: "power3.out" },
    );
    return () => {
      tl.clear();
    };
  }, [tl]);

  // Must run after the timeline is built (effects run in declaration order).
  useLayoutEffect(() => {
    tl.seek(frame / fps, false);
  }, [tl, frame, fps]);

  return (
    <AbsoluteFill style={{ background: "#0b0b0f", justifyContent: "center", alignItems: "center" }}>
      <h1 ref={ref} style={{ color: "white", fontSize: 140, fontFamily: "Inter, sans-serif" }}>
        {title}
      </h1>
    </AbsoluteFill>
  );
};
