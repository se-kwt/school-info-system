import { Prisma } from "@prisma/client";

export function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export function uniqueConstraintTarget(err: unknown): string[] | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return err.meta?.target as string[] | undefined;
  }
  return undefined;
}
