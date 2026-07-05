import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOtp } from "@/lib/auth/verify-otp";

export async function POST(request: Request) {
  const { phone, code } = await request.json();
  if (!phone || !code) {
    return NextResponse.json({ error: "phone and code are required" }, { status: 400 });
  }
  const result = await verifyOtp(phone, code, { prisma });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  return NextResponse.json({ token: result.token });
}
