/** Pure, fail-closed policy for Calc's two-person line review.
 * Persistence and Office role verification must be enforced by the API before release.
 */
export type LineReviewDecision = "approved" | "rejected";
export type LineReview = {
  lineId: number;
  authorActorId: number;
  reviewerActorId: number;
  decision: LineReviewDecision;
  comment: string;
};
export type ReviewerRole = "calculator" | "head_sales" | "administrator";

export function validateLineReview(review: LineReview, role: ReviewerRole): string | null {
  if (!Number.isSafeInteger(review.lineId) || review.lineId <= 0) return "Ongeldige calculatieregel.";
  if (!Number.isSafeInteger(review.authorActorId) || review.authorActorId <= 0
    || !Number.isSafeInteger(review.reviewerActorId) || review.reviewerActorId <= 0) return "Ongeldige gebruiker.";
  if (review.authorActorId === review.reviewerActorId) return "Een calculator mag zijn eigen regel niet goedkeuren.";
  if (role !== "head_sales" && role !== "administrator") return "Alleen Hoofd Sales of hoger mag beoordelen.";
  if (review.decision !== "approved" && review.decision !== "rejected") return "Ongeldige beoordeling.";
  if (review.decision === "rejected" && review.comment.trim().length === 0) return "Bij afkeuren is een opmerking verplicht.";
  return null;
}

export function canReleaseReviewedLines(lineIds: number[], reviews: LineReview[]): boolean {
  if (lineIds.length === 0 || new Set(lineIds).size !== lineIds.length) return false;
  const decisions = new Map<number, LineReview>();
  for (const review of reviews) {
    if (decisions.has(review.lineId)) return false;
    decisions.set(review.lineId, review);
  }
  return lineIds.every(id => {
    const review = decisions.get(id);
    return review !== undefined && review.decision === "approved"
      && review.authorActorId !== review.reviewerActorId;
  });
}

/** Publication gate must fail closed when the feature is enabled. */
export function evaluatePublicationReviewGate(
  requiredLineIds: number[],
  reviews: LineReview[],
  enabled: boolean
): {allowed:boolean;reason:string|null} {
  if (!enabled) return {allowed:true,reason:null};
  if (!canReleaseReviewedLines(requiredLineIds,reviews)) {
    return {allowed:false,reason:"Publiceren geblokkeerd: niet alle calculatieregels zijn onafhankelijk goedgekeurd."};
  }
  return {allowed:true,reason:null};
}
