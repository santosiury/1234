export type ExperienceMode = "client" | "provider";
export interface HealthResponse {
  status: "ok";
  timestamp: string;
}
export interface ServiceCategory {
  id: string;
  name: string;
  icon: string;
}
export interface DemoProfessional {
  id: string;
  name: string;
  categoryId: string;
  specialty: string;
  neighborhood: string;
  description: string;
  initials: string;
}

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  profiles: { client: boolean; provider: boolean };
}
export interface AuthTokens {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}
export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
  profiles: ExperienceMode[];
}

// Real catalog contracts. DemoProfessional remains exclusive to the explicit demo.
export interface CatalogCategory {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}
export interface ProviderServiceRecord {
  id: string;
  categoryId: string;
  title: string;
  description: string | null;
  isActive: boolean;
  category: CatalogCategory;
}
export interface ProviderAreaRecord {
  id: string;
  city: string;
  state: string;
  neighborhood: string; // Empty means the entire city.
  isActive: boolean;
}
export interface ProviderWorkspace {
  id: string;
  professionalName: string;
  bio: string | null;
  isActive: boolean;
  services: ProviderServiceRecord[];
  areas: ProviderAreaRecord[];
}
export interface PublicProvider {
  id: string;
  professionalName: string;
  bio: string | null;
  services: ProviderServiceRecord[];
  areas: ProviderAreaRecord[];
}
export interface CatalogQuery {
  q?: string;
  categoryId?: string;
  city?: string;
  state?: string;
  neighborhood?: string;
  page?: number;
  pageSize?: number;
}
export interface ProviderPage {
  items: PublicProvider[];
  total: number;
  page: number;
  pageSize: number;
}
export interface UpdateProviderInput {
  professionalName?: string;
  bio?: string | null;
}
export interface CreateServiceInput {
  categoryId: string;
  title: string;
  description?: string | null;
  isActive?: boolean;
}
export type UpdateServiceInput = Partial<CreateServiceInput>;
export interface CreateAreaInput {
  city: string;
  state: string;
  neighborhood?: string;
  isActive?: boolean;
}
export type UpdateAreaInput = Partial<CreateAreaInput>;
