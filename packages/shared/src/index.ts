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
