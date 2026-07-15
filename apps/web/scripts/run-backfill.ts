import { prisma } from "../src/lib/prisma";
import { runBackfill } from "./backfill-grades-subjects-periods";

runBackfill(prisma)
  .then(() => {
    console.log("Backfill complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
