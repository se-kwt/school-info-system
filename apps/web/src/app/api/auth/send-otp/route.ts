import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendOtp } from "@/lib/auth/send-otp";
import { ConsoleSmsSender } from "@/lib/auth/sms-sender";

export async function POST(request: Request) {
  let phone: string | undefined;
  try {
    ({ phone } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }
  const result = await sendOtp(phone, {
    prisma,
    smsSender: new ConsoleSmsSender(),
    exposeCodeForTesting: process.env.EXPOSE_OTP_FOR_TESTING === "true",
  });
  if (!result.success) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }
  return NextResponse.json({ success: true, code: result.code });
}
