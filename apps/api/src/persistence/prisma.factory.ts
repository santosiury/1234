import { PrismaClient } from "@prisma/client";
import { parseSqlServerUrl } from "./sqlserver-url";
import { PrismaMssql } from "@prisma/adapter-mssql";
export type DatabaseClient = PrismaClient;
export type DatabaseClientFactory = (url: string) => DatabaseClient;
export const DATABASE_CLIENT_FACTORY = Symbol("DATABASE_CLIENT_FACTORY");
export const createDatabaseClient: DatabaseClientFactory = (url) => {
  const config = parseSqlServerUrl(url);
  return new PrismaClient({
    adapter: new PrismaMssql({
      ...config,
      options: {
        ...config.options,
        // Node 26 rejects IP addresses as TLS server names. This DNS name is
        // only for TLS; keep the isolated test TCP address and port unchanged.
        ...(config.server === "127.0.0.1" && config.port === 15433
          ? { serverName: "localhost" }
          : {}),
      },
    }),
    log: [],
  });
};
