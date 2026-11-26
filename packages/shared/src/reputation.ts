/** Counts and average must come from the backend's same authorized, valid set. */
export const REVIEW_STAR_LEVELS = [5, 4, 3, 2, 1] as const;
export type ReviewRating = (typeof REVIEW_STAR_LEVELS)[number];
export interface ReviewStarCount {
  stars: ReviewRating;
  count: number;
}
export type ReviewDistribution = readonly ReviewStarCount[];
export function isReviewDistribution(
  value: unknown,
  total: number,
): value is ReviewDistribution {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Array.isArray(value) ||
    value.length !== 5
  )
    return false;
  const seen = new Set<number>();
  let sum = 0;
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      !REVIEW_STAR_LEVELS.some((stars) => stars === item.stars) ||
      seen.has(item.stars) ||
      !Number.isSafeInteger(item.count) ||
      item.count < 0
    )
      return false;
    seen.add(item.stars);
    sum += item.count;
    if (!Number.isSafeInteger(sum)) return false;
  }
  return sum === total;
}
export interface ReputationSummary {
  average: number | null;
  total: number;
  distribution: ReviewDistribution;
}

export const REVIEW_DIRECTIONS = [
  "CLIENT_TO_PROVIDER",
  "PROVIDER_TO_CLIENT",
] as const;
export const REVIEW_WINDOW_DAYS = 14;
export const REPUTATION_MIN_DISTINCT_AUTHORS = 5;
export type ReviewDirection = (typeof REVIEW_DIRECTIONS)[number];

/** Public protocol capability, not an authentication credential or user identifier. */
export const PROTECTED_REVIEW_POLICY_HEADER = "X-Omini-Review-Policy";
export const PROTECTED_REVIEW_POLICY = "protected-14d-v1";
