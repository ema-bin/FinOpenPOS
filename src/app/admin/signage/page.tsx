import { notFound } from "next/navigation";
import { SignageAdmin } from "@/components/signage/admin";
import { isDigitalSignageEnabledServer } from "@/lib/signage-flag";

export const dynamic = "force-dynamic";

export default function Page() {
  if (!isDigitalSignageEnabledServer()) notFound();
  return <SignageAdmin />;
}
