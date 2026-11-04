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
