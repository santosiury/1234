/** Brazilian mobile numbers only. No arbitrary URL/string-to-digits coercion. */
const DDDS = new Set(
  "11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split(
    " ",
  ),
);
export function normalizeBrazilMobile(value: string): string | null {
  if (
    typeof value !== "string" ||
    value.length > 30 ||
    !/^\+?[\d ()-]+$/.test(value)
  )
    return null;
  let digits = value.replace(/\D/g, "");
  if (
    value.startsWith("+") &&
    (digits.length !== 13 || !digits.startsWith("55"))
  )
    return null;
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
  if (
    !/^\d{2}9\d{8}$/.test(digits) ||
    !DDDS.has(digits.slice(0, 2)) ||
    /^(\d)\1{8}$/.test(digits.slice(2))
  )
    return null;
  return `+55${digits}`;
}
export function formatBrazilMobile(value: string): string {
  const normalized = normalizeBrazilMobile(value);
  if (!normalized) return "";
  const n = normalized.slice(3);
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}
export function maskBrazilMobile(value: string): string {
  if (!/^\+?[\d ()-]*$/.test(value)) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
  const n = digits.slice(0, 11);
  return n.length > 7
    ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
    : n.length > 2
      ? `(${n.slice(0, 2)}) ${n.slice(2)}`
      : n;
}
export interface ContactInput {
  phone: string;
  hasWhatsapp: boolean;
  shareContact: boolean;
}
export interface OwnContact {
  phone: string | null;
  hasWhatsapp: boolean;
  shareContact: boolean;
  contactReady: boolean;
}
export interface RequestContact {
  phone: string;
  hasWhatsapp: boolean;
}
export const CONTACT_MESSAGE =
  "Olá! Sou o profissional que recebeu sua solicitação pelo Omini. Gostaria de conversar sobre o atendimento.";
export function contactLinks(phone: string) {
  const n = normalizeBrazilMobile(phone);
  if (!n) return null;
  return {
    whatsapp: `https://wa.me/${n.slice(1)}?text=${encodeURIComponent(CONTACT_MESSAGE)}`,
    telephone: `tel:${n}`,
  };
}
export function contactReady(value: {
  phone: string | null;
  phoneShareConsentedAt: Date | null;
}): boolean {
  return (
    !!value.phoneShareConsentedAt &&
    !!value.phone &&
    !!normalizeBrazilMobile(value.phone)
  );
}
