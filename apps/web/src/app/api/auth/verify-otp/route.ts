import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOtp } from "@/lib/auth/verify-otp";

export async function POST(request: Request) {
  let phone: string | undefined;
  let code: string | undefined;
  try {
    ({ phone, code } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!phone || !code) {
    return NextResponse.json({ error: "phone and code are required" }, { status: 400 });
  }
  const result = await verifyOtp(phone, code, { prisma });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  return NextResponse.json({ token: result.token });
}
