import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync(
  "git",
  ["ls-files", "-co", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const failures = [];
for (const file of new Set(files)) {
  if (/(^|\/)\.env($|\.)/.test(file) && !file.endsWith(".env.example"))
    failures.push(file);
  const text = readFileSync(file, "utf8");
  if (
    /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text) ||
    /gh[pousr]_[A-Za-z0-9]{30,}/.test(text)
  )
    failures.push(file);
}
if (failures.length) {
  console.error("Potential sensitive files:", [...new Set(failures)]);
  process.exitCode = 1;
} else
  console.log(
    "No tracked/unignored .env secrets, private key headers or GitHub tokens detected. This scan does not replace review.",
  );
