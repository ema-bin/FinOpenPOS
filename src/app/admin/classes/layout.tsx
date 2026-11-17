import { notFound } from "next/navigation";
import { isClubModuleOpen } from "@/lib/clubs/modules";

export default async function Layout({ children }: { children: React.ReactNode }) {
  if (!(await isClubModuleOpen("classes"))) notFound();
  return children;
}
