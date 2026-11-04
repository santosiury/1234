import type { DemoProfessional, ServiceCategory } from "@omini/shared";
// Fictional catalog, never returned by the API or treated as real availability.
export const categories: ServiceCategory[] = [
  { id: "eletrica", name: "Eletricista", icon: "flash-outline" },
  { id: "hidraulica", name: "Encanador", icon: "water-outline" },
  { id: "alvenaria", name: "Pedreiro", icon: "construct-outline" },
  { id: "pintura", name: "Pintor", icon: "color-palette-outline" },
  { id: "limpeza", name: "Diarista", icon: "sparkles-outline" },
  { id: "montagem", name: "Montador de móveis", icon: "hammer-outline" },
  { id: "informatica", name: "Técnico de informática", icon: "laptop-outline" },
  { id: "climatizacao", name: "Ar-condicionado", icon: "snow-outline" },
];
export const professionals: DemoProfessional[] = [
  {
    id: "ana",
    name: "Ana Martins",
    categoryId: "eletrica",
    specialty: "Instalações e reparos elétricos",
    neighborhood: "Centro",
    initials: "AM",
    description:
      "Perfil fictício para explorar a experiência. Exemplo de profissional de manutenção elétrica residencial.",
  },
  {
    id: "bruno",
    name: "Bruno Costa",
    categoryId: "hidraulica",
    specialty: "Manutenção hidráulica residencial",
    neighborhood: "Cidade Alta",
    initials: "BC",
    description:
      "Perfil fictício de atendimento a reparos hidráulicos e instalações residenciais.",
  },
  {
    id: "carla",
    name: "Carla Santos",
    categoryId: "limpeza",
    specialty: "Cuidado e limpeza do seu lar",
    neighborhood: "Vila São José",
    initials: "CS",
    description:
      "Perfil fictício de profissional de limpeza e organização residencial.",
  },
  {
    id: "diego",
    name: "Diego Lima",
    categoryId: "climatizacao",
    specialty: "Instalação e manutenção de ar",
    neighborhood: "Centro",
    initials: "DL",
    description:
      "Perfil fictício de profissional de climatização. Não recebe solicitações nesta fase.",
  },
];
