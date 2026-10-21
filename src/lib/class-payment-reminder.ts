import { CLASS_PAYMENT_REMINDER_TEMPLATE } from "@/templates/whatsapp/class-payment-reminder.template";

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function classMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const name = MONTHS[Number(month) - 1];
  if (!name || !year) return yearMonth;
  return `${name} ${year}`;
}

export function formatClassAmount(amount: number): string {
  return `$${amount.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function classTransferLine(account: string): string {
  const value = account.trim();
  if (!value) return "Podés hacer la transferencia y mandarnos el comprobante.";
  return `Podés transferir a la cuenta *${value}* y mandarnos el comprobante.`;
}

export function buildClassPaymentReminder(input: {
  firstName: string;
  yearMonth: string;
  professorName: string;
  amount: number;
  account?: string | null;
}): string {
  const firstName = input.firstName.trim();
  return CLASS_PAYMENT_REMINDER_TEMPLATE.replace(/\{nombre\}/gi, firstName)
    .replace(/\{mes\}/gi, classMonthLabel(input.yearMonth))
    .replace(/\{profesor\}/gi, input.professorName.trim() || "el profesor")
    .replace(/\{monto\}/gi, formatClassAmount(input.amount))
    .replace(/\{cuenta\}/gi, classTransferLine(input.account ?? ""))
    .replace(/Hola !/g, "Hola!")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
