import { PrismaClient } from "@prisma/client";
import { parseSqlServerUrl } from "./sqlserver-url";
import { PrismaMssql } from "@prisma/adapter-mssql";
export type DatabaseClient = PrismaClient;
export type DatabaseClientFactory = (url: string) => DatabaseClient;
export const DATABASE_CLIENT_FACTORY = Symbol("DATABASE_CLIENT_FACTORY");
export const createDatabaseClient: DatabaseClientFactory = (url) =>
  new PrismaClient({
    adapter: new PrismaMssql(parseSqlServerUrl(url)),
    log: [],
  });
