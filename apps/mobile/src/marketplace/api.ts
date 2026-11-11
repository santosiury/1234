import type {
  CatalogCategory,
  CatalogQuery,
  CreateAreaInput,
  CreateServiceInput,
  ProviderAreaRecord,
  ProviderPage,
  ProviderServiceRecord,
  ProviderWorkspace,
  PublicProvider,
  UpdateAreaInput,
  UpdateProviderInput,
  UpdateServiceInput,
} from "@omini/shared";
import { AuthFailure } from "../auth/api";
import type { SessionManager } from "../auth/session-manager";
const messages: Record<string, string> = {
  VALIDATION_ERROR: "Confira os campos e os limites indicados no formulário.",
  PROVIDER_REQUIRED:
    "Ative seu perfil de prestador na área da conta para continuar.",
  CATEGORY_UNAVAILABLE:
    "Essa categoria está indisponível. Escolha uma categoria ativa.",
  DUPLICATE_RECORD: "Já existe um cadastro com esses dados. Edite o existente.",
  LIMIT_REACHED:
    "Limite de 50 registros atingido. Edite um cadastro existente.",
  CONCURRENT_UPDATE: "Os dados mudaram. Atualize a tela e tente novamente.",
  NOT_FOUND: "Esse cadastro não está disponível.",
  TOO_MANY_ATTEMPTS: "Muitas consultas. Aguarde e tente novamente.",
  SESSION_EXPIRED: "Sua sessão expirou. Entre novamente.",
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object";
const text = (v: unknown): v is string => typeof v === "string";
const nullableText = (v: unknown) => v === null || text(v);
function category(v: unknown): v is CatalogCategory {
  return (
    record(v) &&
    text(v.id) &&
    text(v.slug) &&
    text(v.name) &&
    typeof v.isActive === "boolean"
  );
}
function service(v: unknown): v is ProviderServiceRecord {
  return (
    record(v) &&
    text(v.id) &&
    text(v.categoryId) &&
    text(v.title) &&
    nullableText(v.description) &&
    typeof v.isActive === "boolean" &&
    category(v.category)
  );
}
function area(v: unknown): v is ProviderAreaRecord {
  return (
    record(v) &&
    text(v.id) &&
    text(v.city) &&
    text(v.state) &&
    text(v.neighborhood) &&
    typeof v.isActive === "boolean"
  );
}
function provider(v: unknown): v is PublicProvider {
  return (
    record(v) &&
    text(v.id) &&
    text(v.professionalName) &&
    nullableText(v.bio) &&
    Array.isArray(v.services) &&
    v.services.every(service) &&
    Array.isArray(v.areas) &&
    v.areas.every(area)
  );
}
function workspace(v: unknown): v is ProviderWorkspace {
  return provider(v) && "isActive" in v && typeof v.isActive === "boolean";
}
function page(v: unknown): v is ProviderPage {
  return (
    record(v) &&
    Array.isArray(v.items) &&
    v.items.every(provider) &&
    Number.isInteger(v.total) &&
    Number(v.total) >= 0 &&
    Number.isInteger(v.page) &&
    Number(v.page) >= 1 &&
    Number.isInteger(v.pageSize) &&
    Number(v.pageSize) >= 1 &&
    Number(v.pageSize) <= 20
  );
}
function parse<T>(value: unknown, valid: (v: unknown) => v is T): T {
  if (!valid(value))
    throw new AuthFailure(
      502,
      "INVALID_RESPONSE",
      "Resposta inesperada do catálogo.",
    );
  return value;
}
export class MarketplaceHttp {
  constructor(
    private readonly baseUrl: () => string | undefined = () =>
      process.env.EXPO_PUBLIC_API_URL,
  ) {}
  async request(
    path: string,
    method = "GET",
    body?: unknown,
    access?: string,
  ): Promise<unknown> {
    const base = this.baseUrl();
    let address: URL;
    try {
      address = new URL(base ?? "");
    } catch {
      throw new AuthFailure(
        0,
        "CONFIGURATION",
        "Configure o endereço da API na rede local.",
      );
    }
    if (
      !/^https?:$/.test(address.protocol) ||
      address.username ||
      address.password ||
      (!__DEV__ && address.protocol !== "https:")
    )
      throw new AuthFailure(
        0,
        "CONFIGURATION",
        "Use HTTPS fora do desenvolvimento e não inclua credenciais no endereço.",
      );
    let response: Response;
    try {
      response = await fetch(`${base!.replace(/\/$/, "")}/${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new AuthFailure(
        0,
        "NETWORK",
        "Não foi possível conectar ao catálogo. Verifique a rede e tente novamente.",
      );
    }
    if (!response.ok) {
      let code = "REQUEST_FAILED";
      try {
        const data: unknown = await response.json();
        if (record(data) && text(data.code)) code = data.code;
      } catch {
        /* Never display arbitrary server text. */
      }
      throw new AuthFailure(
        response.status,
        code,
        messages[code] ??
          "O catálogo está temporariamente indisponível. Tente novamente.",
      );
    }
    try {
      return await response.json();
    } catch {
      throw new AuthFailure(
        502,
        "INVALID_RESPONSE",
        "Resposta inesperada do catálogo.",
      );
    }
  }
}
const http = new MarketplaceHttp();
export class CatalogApi {
  async categories() {
    return parse(
      await http.request("catalog/categories"),
      (v): v is CatalogCategory[] => Array.isArray(v) && v.every(category),
    );
  }
  async providers(query: CatalogQuery = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined && value !== "") params.set(key, String(value));
    return parse(
      await http.request(`catalog/providers?${params.toString()}`),
      page,
    );
  }
  async provider(id: string) {
    return parse(
      await http.request(`catalog/providers/${encodeURIComponent(id)}`),
      provider,
    );
  }
}
export class ProviderApi {
  constructor(private readonly session: SessionManager) {}
  private call<T>(
    path: string,
    valid: (v: unknown) => v is T,
    method = "GET",
    body?: unknown,
  ) {
    return this.session.request(async (access) =>
      parse(
        await http.request(`provider/me${path}`, method, body, access),
        valid,
      ),
    );
  }
  me() {
    return this.call("", workspace);
  }
  update(input: UpdateProviderInput) {
    return this.call("", workspace, "PATCH", input);
  }
  createService(input: CreateServiceInput) {
    return this.call("/services", service, "POST", input);
  }
  updateService(id: string, input: UpdateServiceInput) {
    return this.call(
      `/services/${encodeURIComponent(id)}`,
      service,
      "PATCH",
      input,
    );
  }
  createArea(input: CreateAreaInput) {
    return this.call("/areas", area, "POST", input);
  }
  updateArea(id: string, input: UpdateAreaInput) {
    return this.call(`/areas/${encodeURIComponent(id)}`, area, "PATCH", input);
  }
}
