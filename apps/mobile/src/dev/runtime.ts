// Development-only identifier for confirming the bundle opened in Expo Go.
// This is a source revision, not proof of a physical-device test or a Git commit.
export const MOBILE_UI_REVISION = "2.6-mobile-r4";

/** Never echo userinfo, query strings, fragments or arbitrary URL paths. */
export function runtimeApiLabel(value: string | undefined): string {
  if (!value) return "Não configurada";
  try {
    const address = new URL(value);
    if (
      !["http:", "https:"].includes(address.protocol) ||
      address.username ||
      address.password ||
      address.search ||
      address.hash
    )
      return "Configuração inválida; confira o endereço local sem credenciais.";
    if (
      ["localhost", "127.0.0.1", "[::1]"].includes(
        address.hostname.toLowerCase(),
      )
    )
      return "Loopback do dispositivo; use o IP do computador no iPhone.";
    if (address.pathname.replace(/\/+$/, "") !== "/api")
      return "Confira o endereço: a base da API deve terminar em /api.";
    return `${address.origin}/api`;
  } catch {
    return "Configuração inválida; confira o endereço da API.";
  }
}
