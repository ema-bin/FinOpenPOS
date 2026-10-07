/**
 * Plantilla del recordatorio de deuda (Cuentas abiertas → WhatsApp).
 * Placeholders: {nombre}, {nombre_completo}, {saldo}, {detalle}
 * {detalle} se reemplaza por el desglose de la cuenta o se elimina si no se incluye.
 * Formato WhatsApp: *negrita*, _cursiva_
 */
export const DEBT_REMINDER_TEMPLATE = `Hola {nombre}!

Te escribimos para recordarte que tenés una cuenta abierta con un saldo pendiente de *{saldo}*.

{detalle}

Cuando puedas, acercate a abonarla o avisanos si preferís transferir. Muchas gracias!`;
