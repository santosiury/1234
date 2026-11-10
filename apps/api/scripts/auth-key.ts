import { appendFile, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { parse } from "dotenv";
async function main() {
  const file = ".env";
  const content = await readFile(file, "utf8");
  if (parse(content).JWT_ACCESS_SECRET?.trim()) {
    console.log("JWT_ACCESS_SECRET já existe e foi preservada.");
    return;
  }
  await appendFile(
    file,
    `\nJWT_ACCESS_SECRET=${randomBytes(48).toString("base64")}\n`,
    { mode: 0o600 },
  );
  console.log(
    "Chave aleatória gravada apenas no .env local. O valor não foi exibido.",
  );
}
main().catch(() => {
  console.error(
    "Não foi possível gravar a chave. Crie apps/api/.env a partir do template e verifique as permissões locais.",
  );
  process.exitCode = 1;
});
