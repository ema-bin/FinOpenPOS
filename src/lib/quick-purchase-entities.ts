import type { createRepositories } from "@/lib/repository-factory";

export const QUICK_PURCHASE_SUPPLIER_NAME = "Varios";
export const QUICK_PURCHASE_PRODUCT_NAME = "Varios";

type Repos = Awaited<ReturnType<typeof createRepositories>>;

export async function resolveQuickPurchaseSupplier(repos: Repos) {
  const suppliers = await repos.suppliers.findAll({ search: QUICK_PURCHASE_SUPPLIER_NAME });
  const existing = suppliers.find((s) => s.name === QUICK_PURCHASE_SUPPLIER_NAME);
  if (existing) return existing;

  return repos.suppliers.create({
    name: QUICK_PURCHASE_SUPPLIER_NAME,
    notes: "Proveedor genérico para compras rápidas",
    status: "active",
  });
}

export async function resolveQuickPurchaseProduct(repos: Repos) {
  const products = await repos.products.findAll({
    search: QUICK_PURCHASE_PRODUCT_NAME,
    status: "all",
  });
  const existing = products.find((p) => p.name === QUICK_PURCHASE_PRODUCT_NAME);
  if (existing) return existing;

  return repos.products.create({
    name: QUICK_PURCHASE_PRODUCT_NAME,
    description: "Producto genérico para compras rápidas sin detalle",
    price: 0,
    uses_stock: false,
    min_stock: 0,
    is_active: true,
  });
}
