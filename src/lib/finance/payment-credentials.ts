export const COURT_PAYMENT_SCOPES = ["COURT", "BOTH"] as const;

export function isCourtPaymentScope(scope: string): boolean {
  return scope === "COURT" || scope === "BOTH";
}

export type CourtPaymentMethodRow = {
  id: number;
  name: string;
  scope: string;
  is_active: boolean;
  is_mercadopago: boolean;
};

export type CredentialStamp = {
  payment_method_id: number;
  updated_at: string;
};

export type PaymentCredentialStatus = {
  id: number;
  name: string;
  scope: string;
  isActive: boolean;
  configured: boolean;
  updatedAt: string | null;
};

export function paymentCredentialStatus(
  methods: CourtPaymentMethodRow[],
  credentials: CredentialStamp[],
): PaymentCredentialStatus[] {
  const updatedAt = new Map(credentials.map((row) => [row.payment_method_id, row.updated_at]));
  return methods
    .filter((method) => isCourtPaymentScope(method.scope) && method.is_mercadopago)
    .map((method) => ({
      id: method.id,
      name: method.name,
      scope: method.scope,
      isActive: method.is_active,
      configured: updatedAt.has(method.id),
      updatedAt: updatedAt.get(method.id) ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}
