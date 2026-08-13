/** Herramientas de testing para fase de grupos (simular / limpiar resultados). */
export function isGroupTestToolsEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_GROUP_TEST_TOOLS === "true";
}

export function isGroupTestToolsEnabledServer(): boolean {
  return (
    process.env.ENABLE_GROUP_TEST_TOOLS === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_GROUP_TEST_TOOLS === "true"
  );
}
