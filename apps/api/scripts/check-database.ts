import "dotenv/config";
import { createDatabaseClient } from "../src/persistence/prisma.factory";
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Missing runtime URL");
  const db = createDatabaseClient(process.env.DATABASE_URL);
  try {
    await db.$queryRaw`SELECT 1 AS connected`;
    console.log("SQL Server runtime connection successful (SELECT 1 only).");
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "SQL Server check failed. Check runtime URL, permissions, TCP and TLS locally. Credentials and driver details are not logged.",
  );
  process.exitCode = 1;
});
