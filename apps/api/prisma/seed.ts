import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { parseSqlServerUrl } from "../src/persistence/sqlserver-url";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { seedCategories } from "./categories";
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const connection = parseSqlServerUrl(url);
  if (
    connection.database !== "OminiDB" ||
    connection.user.toLowerCase() !== "omini_app"
  )
    throw new Error("Seed requires the runtime identity in OminiDB");
  const client = new PrismaClient({
    adapter: new PrismaMssql(connection),
    log: [],
  });
  try {
    await client.$transaction(async (tx) => seedCategories(tx));
    console.log(
      "Initial categories ensured; existing records and activation states preserved.",
    );
  } finally {
    await client.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Category seed failed. Check runtime credentials and applied migrations locally; no driver details were logged.",
  );
  process.exitCode = 1;
});
