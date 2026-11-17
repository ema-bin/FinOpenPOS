/**
 * Cartelería digital. Apagada salvo que las dos variables estén en "true".
 * ENABLE_DIGITAL_SIGNAGE la lee el servidor. NEXT_PUBLIC_ENABLE_DIGITAL_SIGNAGE, la pantalla.
 */
export function isDigitalSignageEnabledServer(): boolean {
  return (
    process.env.ENABLE_DIGITAL_SIGNAGE === "true" &&
    process.env.NEXT_PUBLIC_ENABLE_DIGITAL_SIGNAGE === "true"
  );
}

export function isDigitalSignageEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_DIGITAL_SIGNAGE === "true";
}
