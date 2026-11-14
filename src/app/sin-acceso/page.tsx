import { logout } from "@/app/login/actions";
import { CLUB_LOGO_SRC } from "@/lib/clubs/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

export default function SinAccesoPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-2">
          <img src={CLUB_LOGO_SRC} alt="" width={120} height={120} className="h-[120px] w-[120px] object-contain" />
          <h2 className="text-2xl font-bold">Sin acceso</h2>
          <p className="text-center text-muted-foreground">
            Tu usuario no tiene un rol asignado. Pedile a un administrador que te dé acceso.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Si recién te crearon el usuario, puede tardar un momento en quedar activo. Cerrá
            sesión y volvé a entrar.
          </CardContent>
          <CardFooter>
            <form action={logout}>
              <Button type="submit" variant="outline">
                Cerrar sesión
              </Button>
            </form>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
