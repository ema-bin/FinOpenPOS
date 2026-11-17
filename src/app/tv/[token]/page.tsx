import { notFound } from "next/navigation";
import { TvScreen } from "@/components/signage/tv-screen";
import { isDigitalSignageEnabledServer } from "@/lib/signage-flag";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default function Page({ params }: { params: { token: string } }) {
  if (!isDigitalSignageEnabledServer()) notFound();
  return <TvScreen token={params.token} />;
}
