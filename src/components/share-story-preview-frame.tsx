"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SHARE_PORTRAIT_CAPTURE_WIDTH } from "@/lib/share-image-export";

type ShareStoryPreviewFrameProps = {
  children: ReactNode;
  className?: string;
};

/** Marco 9:16 en pantalla; escala el flyer si el contenido es más alto que un story. */
export function ShareStoryPreviewFrame({
  children,
  className,
}: ShareStoryPreviewFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;

    const updateScale = () => {
      const available = frame.clientHeight;
      const needed = content.offsetHeight;
      if (needed <= 0 || available <= 0) {
        setScale(1);
        return;
      }
      setScale(Math.min(1, available / needed));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(frame);
    observer.observe(content);
    return () => observer.disconnect();
  }, [children]);

  return (
    <div ref={frameRef} className={cn("share-story-preview-frame", className)}>
      <div
        ref={contentRef}
        className="share-story-preview-frame__content"
        style={
          scale < 1
            ? {
                transform: `scale(${scale})`,
                transformOrigin: "top center",
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}

export { SHARE_PORTRAIT_CAPTURE_WIDTH };
