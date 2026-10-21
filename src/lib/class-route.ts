import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { CLASSES_SQL_HINT } from "./class-payment-methods";
import { ClassRequestError } from "./class-request-error";

type Repositories = Awaited<ReturnType<typeof createRepositories>>;

export function idParam(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ClassRequestError("Id inválido");
  }
  return id;
}

export async function withClasses(
  logLabel: string,
  handler: (repos: Repositories) => Promise<Response>
): Promise<Response> {
  try {
    const repos = await createRepositories();
    return await handler(repos);
  } catch (error) {
    if (error instanceof ClassRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(logLabel, error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const missing = /add-classes|class_professors|class_sessions|schema cache/i.test(message);
    return NextResponse.json(
      { error: missing ? CLASSES_SQL_HINT : message },
      { status: missing ? 503 : 500 }
    );
  }
}
