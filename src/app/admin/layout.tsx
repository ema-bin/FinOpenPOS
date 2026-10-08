import { AdminLayout } from "@/components/admin-layout";
import { PermissionsProvider } from "@/components/permissions-provider";

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // La autenticación y los permisos de página los resuelve el middleware.
  return (
    <PermissionsProvider>
      <AdminLayout>{children}</AdminLayout>
    </PermissionsProvider>
  );
}
