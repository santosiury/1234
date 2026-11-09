// Parse JDBC-style Prisma URLs into a driver config. The adapter 6.19 string
// shortcut splits on semicolons and would corrupt passwords containing delimiters.
export function parseSqlServerUrl(url: string) {
  const invalid = () =>
    new Error("Invalid SQL Server connection configuration");
  if (!url.startsWith("sqlserver://") || /[\r\n\0]/.test(url)) throw invalid();
  const separator = url.indexOf(";");
  if (separator < 0) throw invalid();
  const authority = /^([a-zA-Z0-9.-]+):(\d+)$/.exec(url.slice(12, separator));
  if (!authority) throw invalid();
  const port = Number(authority[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw invalid();
  const parameters = new Map<string, string>();
  let cursor = separator + 1;
  while (cursor < url.length) {
    const equals = url.indexOf("=", cursor);
    if (equals < 0) throw invalid();
    const key = url.slice(cursor, equals).trim().toLowerCase();
    if (!/^[a-z]+$/.test(key) || parameters.has(key)) throw invalid();
    cursor = equals + 1;
    let value = "";
    if (url[cursor] === "{") {
      cursor++;
      let closed = false;
      while (cursor < url.length) {
        const ch = url[cursor++];
        if (ch === "}") {
          if (url[cursor] === "}") {
            value += "}";
            cursor++;
          } else {
            closed = true;
            break;
          }
        } else value += ch;
      }
      if (!closed || (cursor < url.length && url[cursor] !== ";"))
        throw invalid();
    } else {
      const end = url.indexOf(";", cursor);
      const stop = end < 0 ? url.length : end;
      value = url.slice(cursor, stop).trim();
      cursor = stop;
      if (/[{}]/.test(value)) throw invalid();
    }
    parameters.set(key, value);
    if (cursor < url.length) cursor++;
  }
  const allowed = [
    "database",
    "user",
    "password",
    "encrypt",
    "trustservercertificate",
    "connectiontimeout",
  ];
  if ([...parameters.keys()].some((key) => !allowed.includes(key)))
    throw invalid();
  const required = (key: string) => {
    const value = parameters.get(key);
    if (!value) throw invalid();
    return value;
  };
  const boolean = (key: string, fallback: boolean) => {
    const value = parameters.get(key)?.toLowerCase();
    if (value === undefined) return fallback;
    if (!["true", "false"].includes(value)) throw invalid();
    return value === "true";
  };
  const encrypt = boolean("encrypt", true);
  if (!encrypt) throw new Error("SQL Server encryption must remain enabled");
  const connectionTimeout = Number(parameters.get("connectiontimeout") ?? 5000);
  if (
    !Number.isInteger(connectionTimeout) ||
    connectionTimeout < 1 ||
    connectionTimeout > 120000
  )
    throw invalid();
  return {
    server: authority[1],
    port,
    database: required("database"),
    user: required("user"),
    password: required("password"),
    connectionTimeout,
    requestTimeout: 5000,
    options: {
      encrypt,
      trustServerCertificate: boolean("trustservercertificate", false),
    },
  };
}
