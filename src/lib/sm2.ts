// SuperMemo-2 (SM-2) spaced repetition algorithm.
// Pure functions only: no database or I/O, so the scheduling math is
// trivially unit-testable and reusable by any caller (API routes, jobs).

/** The SM-2 quality rating for a single review, 0 (complete blackout) to 5 (perfect). */
export type Sm2Quality = 0 | 1 | 2 | 3 | 4 | 5;

/** The minimum allowed ease factor in SM-2; below this, recall collapses. */
export const MIN_EASE_FACTOR = 1.3;

/** Default ease factor for new cards, per the SM-2 paper. */
export const DEFAULT_EASE_FACTOR = 2.5;

/** The persistent per-card scheduling state SM-2 evolves. */
export interface Sm2State {
  /** Number of consecutive successful (quality >= 3) reviews. */
  repetitions: number;
  /** easiness of the card; >= 1.3. Higher = longer intervals. */
  easeFactor: number;
  /** Current inter-review interval in whole days. */
  interval: number;
}

/** The result of applying one SM-2 review to a card's state. */
export interface Sm2Result extends Sm2State {
  /** When the card should next be shown: now + interval days. */
  dueDate: Date;
}

/**
 * Applies one SM-2 review to a card's scheduling state.
 *
 * Rules:
 * - quality < 3 (fail): repetitions reset to 0, interval resets to 1 day;
 *   the ease factor still moves (downward) per the EF formula.
 * - quality >= 3 (pass): interval becomes 1 day on the first successful
 *   repetition, 6 days on the second, then interval * easeFactor; the
 *   repetition counter increments.
 * - easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
 *   floored at 1.3.
 *
 * @param quality - Review rating, integer 0-5.
 * @param repetitions - Successful-review streak before this review.
 * @param easeFactor - Card ease before this review (>= 1.3 expected).
 * @param interval - Current interval in whole days.
 * @returns The updated scheduling state including the next due date.
 * @throws Error if quality is not an integer in [0, 5] or the numeric
 * inputs are not finite (interval is additionally floored at 1).
 */
export function calculateSM2(
  quality: number,
  repetitions: number,
  easeFactor: number,
  interval: number,
): Sm2Result {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new Error('SM-2 quality must be an integer between 0 and 5.');
  }
  if (
    !Number.isFinite(repetitions) ||
    !Number.isFinite(easeFactor) ||
    !Number.isFinite(interval)
  ) {
    throw new Error('SM-2 state must be finite numbers.');
  }

  const safeRepetitions = Math.max(0, Math.floor(repetitions));
  const safeInterval = Math.max(1, Math.floor(interval));

  // Update the ease factor based on how the review went...
  const qualityGap = 5 - quality;
  const newEaseFactor = Math.max(
    MIN_EASE_FACTOR,
    easeFactor + (0.1 - qualityGap * (0.08 + qualityGap * 0.02)),
  );

  let newRepetitions: number;
  let newInterval: number;

  if (quality < 3) {
    // Failed review: restart the learning streak.
    newRepetitions = 0;
    newInterval = 1;
  } else {
    newRepetitions = safeRepetitions + 1;

    if (safeRepetitions === 0) {
      newInterval = 1;
    } else if (safeRepetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(safeInterval * newEaseFactor);
    }
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + newInterval);

  return {
    repetitions: newRepetitions,
    easeFactor: Number(newEaseFactor.toFixed(4)),
    interval: newInterval,
    dueDate,
  };
}
