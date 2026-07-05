import { PrismaClient } from "@prisma/client";
import { createSeedFixtures } from "./fixtures";

const prisma = new PrismaClient();

async function main() {
  const { school, student } = await createSeedFixtures(prisma);
  console.log("Seed complete:", { school: school.name, student: student.name });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
