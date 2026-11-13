import { Prisma } from "@prisma/client";
import type { ParsedCatalogQuery } from "./validation";
// All search comparisons deliberately use one SQL Server CI/AI collation, regardless
// of the database default. LIKE metacharacters are literals, never caller SQL.
export function literalPattern(value: string) {
  return `%${value.replace(/~/g, "~~").replace(/[%_\[]/g, "~$&")}%`;
}
export function catalogWhere(query: ParsedCatalogQuery): Prisma.Sql {
  const conditions = [
    Prisma.sql`p.[isActive] = 1 AND u.[isActive] = 1`,
    Prisma.sql`EXISTS (SELECT 1 FROM [dbo].[ProviderService] s INNER JOIN [dbo].[ServiceCategory] c ON c.[id] = s.[categoryId] WHERE s.[providerId] = p.[id] AND s.[isActive] = 1 AND c.[isActive] = 1)`,
  ];
  if (query.categoryId)
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM [dbo].[ProviderService] s INNER JOIN [dbo].[ServiceCategory] c ON c.[id] = s.[categoryId] WHERE s.[providerId] = p.[id] AND s.[isActive] = 1 AND c.[isActive] = 1 AND c.[id] = ${query.categoryId})`,
    );
  if (query.q) {
    const pattern = literalPattern(query.q);
    conditions.push(
      Prisma.sql`(p.[professionalName] COLLATE Latin1_General_100_CI_AI LIKE ${pattern} ESCAPE N'~' OR EXISTS (SELECT 1 FROM [dbo].[ProviderService] s INNER JOIN [dbo].[ServiceCategory] c ON c.[id] = s.[categoryId] WHERE s.[providerId] = p.[id] AND s.[isActive] = 1 AND c.[isActive] = 1 AND (s.[title] COLLATE Latin1_General_100_CI_AI LIKE ${pattern} ESCAPE N'~' OR c.[name] COLLATE Latin1_General_100_CI_AI LIKE ${pattern} ESCAPE N'~')))`,
    );
  }
  const area = [Prisma.sql`a.[providerId] = p.[id] AND a.[isActive] = 1`];
  if (query.city)
    area.push(
      Prisma.sql`a.[city] COLLATE Latin1_General_100_CI_AI = ${query.city}`,
    );
  if (query.state)
    area.push(
      Prisma.sql`a.[state] COLLATE Latin1_General_100_CI_AI = ${query.state}`,
    );
  conditions.push(
    Prisma.sql`EXISTS (SELECT 1 FROM [dbo].[ProviderServiceArea] a WHERE ${Prisma.join(area, " AND ")})`,
  );
  return Prisma.join(conditions, " AND ");
}
