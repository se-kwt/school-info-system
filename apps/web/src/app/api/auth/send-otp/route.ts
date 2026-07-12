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
  try {
    const result = await sendOtp(phone, {
      prisma,
      smsSender: new ConsoleSmsSender(),
      exposeCodeForTesting: process.env.EXPOSE_OTP_FOR_TESTING === "true",
    });
    return NextResponse.json({ success: true, code: result.code });
  } catch (err) {
    if (err instanceof Error && err.message === "PHONE_NOT_REGISTERED") {
      return NextResponse.json({ error: "Phone number is not registered" }, { status: 404 });
    }
    throw err;
  }
}
