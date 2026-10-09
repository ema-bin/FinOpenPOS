// app/providers.tsx (por ejemplo)
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { InteractionLockGuard } from "@/components/interaction-lock-guard";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <InteractionLockGuard />
      {children}
    </QueryClientProvider>
  );
}
