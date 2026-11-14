import { CLUB_LOGO_SRC } from "@/lib/clubs/logo";

export function Logo({ className = "h-16", alt = "" }: { className?: string; alt?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src={CLUB_LOGO_SRC}
        alt={alt}
        className="object-contain"
        style={{ maxHeight: "100%", width: "auto", height: "100%" }}
        crossOrigin="anonymous"
      />
    </div>
  );
}
