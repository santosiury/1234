import { readFile } from "node:fs/promises";
import { getDMMF, getGenerators, validate } from "@prisma/internals";
// Pinned Prisma API: WASM validation and the official JS generator, no database access.
// engineType=client requires no native engine; npm package integrity checks remain enabled.
async function main() {
  const schemaPath = "prisma/schema.prisma";
  const datamodel = await readFile(schemaPath, "utf8");
  validate({ schemas: [[schemaPath, datamodel]] });
  const dmmf = await getDMMF({ datamodel });
  if (process.argv[2] === "generate") {
    const generators = await getGenerators({
      schemaPath,
      registry: {
        "prisma-client-js": {
          type: "rpc",
          generatorPath:
            require.resolve("@prisma/client/generator-build/index.js"),
          isNode: true,
        },
      },
      skipDownload: true,
    });
    try {
      for (const generator of generators) {
        if (generator.manifest?.requiresEngines?.length)
          throw new Error(
            "This generator requires native engines; use the verified Prisma CLI instead",
          );
        await generator.generate();
      }
    } finally {
      for (const generator of generators) generator.stop();
    }
    console.log(
      "Prisma Client generated with the official JS generator (no native engine required).",
    );
  } else
    console.log(
      `Prisma WASM validation passed: ${dmmf.datamodel.models.length} models.`,
    );
}
main().catch(() => {
  console.error(
    "Prisma schema validation/generation failed. Review schema.prisma; no connection or credentials were logged.",
  );
  process.exitCode = 1;
});
