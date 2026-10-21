export const CLASS_PROFESSOR_PAYMENT_METHOD_NAMES = ["pcp.clases.seba", "pcp.clases.manu"] as const;

/** Transferencia a Cintia. No es la cuenta del profesor. */
export const CLASS_CINTIA_PAYMENT_METHOD_NAME = "pcp.clases.cintia";

/** Efectivo de las clases. No es la caja de la cantina. */
export const CLASS_CASH_PAYMENT_METHOD_NAME = "pcp.clases.efectivo";

export const CLASS_PAYMENT_METHOD_NAMES = [
  ...CLASS_PROFESSOR_PAYMENT_METHOD_NAMES,
  CLASS_CINTIA_PAYMENT_METHOD_NAME,
  CLASS_CASH_PAYMENT_METHOD_NAME,
] as const;

export const CLASSES_SQL_HINT = "Falta correr scripts/add-classes.sql en Supabase.";

const PROFESSOR_METHOD_NAMES: readonly string[] = CLASS_PROFESSOR_PAYMENT_METHOD_NAMES;

export function classPaymentMethodLabel(name: string | null | undefined): string {
  if (!name) return "-";
  if (name === CLASS_CASH_PAYMENT_METHOD_NAME) return "Efectivo";
  if (name === CLASS_CINTIA_PAYMENT_METHOD_NAME) return "Transferencia Cintia";
  if (PROFESSOR_METHOD_NAMES.includes(name)) return "Transferencia al profe";
  return name;
}
