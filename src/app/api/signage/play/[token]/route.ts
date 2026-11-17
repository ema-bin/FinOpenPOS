export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { playbackForToken } from "@/lib/signage/data";
import { signageHttpError, signageUnavailable } from "@/lib/signage/guard";
import { isDigitalSignageEnabledServer } from "@/lib/signage-flag";

type Params = { params: { token: string } };

export async function GET(request: Request, { params }: Params) {
  if (!isDigitalSignageEnabledServer()) return signageUnavailable();
  try {
    const revision = new URL(request.url).searchParams.get("revision");
    return NextResponse.json(await playbackForToken(params.token, revision));
  } catch (error) {
    return signageHttpError(error);
  }
}
