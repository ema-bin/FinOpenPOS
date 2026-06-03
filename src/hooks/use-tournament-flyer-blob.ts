"use client";

import { useEffect, useState } from "react";
import {
  fetchTournamentFlyerBlob,
  imageBlobToPng,
} from "@/lib/copy-image-url";

/**
 * Precarga el flier y lo convierte a PNG antes del click,
 * para que copiar al portapapeles no pierda el gesto del usuario.
 */
export function useTournamentFlyerBlob(
  tournamentId: number,
  enabled: boolean,
  /** Cambia al subir un flier nuevo (misma URL base con otro archivo). */
  cacheKey?: string
) {
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setPngBlob(null);
      setError(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    setPngBlob(null);

    fetchTournamentFlyerBlob(tournamentId)
      .then((raw) => imageBlobToPng(raw))
      .then((png) => {
        if (!cancelled) {
          setPngBlob(png);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPngBlob(null);
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tournamentId, enabled, cacheKey]);

  return {
    pngBlob,
    loading,
    error,
    ready: Boolean(pngBlob),
  };
}
