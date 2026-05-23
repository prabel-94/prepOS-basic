/**
 * PrepOS Analytics Core
 * ---------------------------------------
 * Shared analytics utility layer.
 *
 * PURPOSE:
 * - Pure analytics/statistical helpers
 * - Shared computation utilities
 * - Reusable scoring functions
 * - Safe mathematical operations
 *
 * IMPORTANT:
 * - NO DOM operations
 * - NO Supabase queries
 * - NO rendering logic
 * - NO business-specific analytics
 *
 * ARCHITECTURE ROLE:
 * Raw Data
 *    ↓
 * analytics-core.js
 *    ↓
 * Analytics Engines
 *
 * Used by:
 * - attempt-analytics.js
 * - difficulty-engine.js
 * - topic-performance.js
 * - question-performance.js
 *
 * PrepOS Analytics Architecture v1
 */


/* =========================================================
   BASIC SAFETY HELPERS
========================================================= */

/**
 * Safely converts a value into a number.
 */
export function toNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}


/**
 * Safe division helper.
 * Prevents divide-by-zero errors.
 */
export function safeDivide(a, b, fallback = 0) {
  const numerator = toNumber(a);
  const denominator = toNumber(b);

  if (denominator === 0) {
    return fallback;
  }

  return numerator / denominator;
}


/**
 * Clamp a number between min/max.
 */
export function clamp(value, min = 0, max = 1) {
  return Math.min(
    Math.max(value, min),
    max
  );
}


/**
 * Round a number safely.
 */
export function round(value, digits = 2) {
  const n = toNumber(value);

  const factor = 10 ** digits;

  return Math.round(n * factor) / factor;
}



/* =========================================================
   PERCENTAGE HELPERS
========================================================= */

/**
 * Convert ratio to percentage.
 *
 * Example:
 * ratioToPercentage(0.42)
 * => 42
 */
export function ratioToPercentage(ratio, digits = 2) {
  return round(
    toNumber(ratio) * 100,
    digits
  );
}


/**
 * Percentage helper.
 *
 * Example:
 * percentage(25, 100)
 * => 25
 */
export function percentage(part, total, digits = 2) {
  return ratioToPercentage(
    safeDivide(part, total),
    digits
  );
}



/* =========================================================
   ACCURACY HELPERS
========================================================= */

/**
 * Calculate accuracy percentage.
 *
 * Example:
 * calculateAccuracy(80, 100)
 * => 80
 */
export function calculateAccuracy(correct, total, digits = 2) {
  return percentage(correct, total, digits);
}


/**
 * Calculate error rate.
 */
export function calculateErrorRate(correct, total, digits = 2) {
  const incorrect = toNumber(total) - toNumber(correct);

  return percentage(incorrect, total, digits);
}


/**
 * Calculate skip rate.
 */
export function calculateSkipRate(skipped, total, digits = 2) {
  return percentage(skipped, total, digits);
}



/* =========================================================
   ARRAY / STATISTICAL HELPERS
========================================================= */

/**
 * Sum numeric array.
 */
export function sum(values = []) {
  return values.reduce((acc, value) => {
    return acc + toNumber(value);
  }, 0);
}


/**
 * Average numeric array.
 */
export function average(values = [], digits = 2) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  return round(
    safeDivide(sum(values), values.length),
    digits
  );
}


/**
 * Find minimum value.
 */
export function min(values = []) {
  if (!values.length) {
    return 0;
  }

  return Math.min(...values.map(toNumber));
}


/**
 * Find maximum value.
 */
export function max(values = []) {
  if (!values.length) {
    return 0;
  }

  return Math.max(...values.map(toNumber));
}


/**
 * Median helper.
 */
export function median(values = []) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values]
    .map(toNumber)
    .sort((a, b) => a - b);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return average([
      sorted[middle - 1],
      sorted[middle]
    ]);
  }

  return sorted[middle];
}



/* =========================================================
   NORMALIZATION HELPERS
========================================================= */

/**
 * Normalize value into 0-1 range.
 */
export function normalizeScore(
  value,
  minValue,
  maxValue
) {
  if (maxValue === minValue) {
    return 0;
  }

  return clamp(
    safeDivide(
      value - minValue,
      maxValue - minValue
    )
  );
}


/**
 * Invert normalized value.
 *
 * Useful when:
 * lower accuracy = higher difficulty
 */
export function invertNormalized(value) {
  return clamp(1 - toNumber(value));
}



/* =========================================================
   TIME HELPERS
========================================================= */

/**
 * Convert seconds → minutes.
 */
export function secondsToMinutes(seconds, digits = 2) {
  return round(
    safeDivide(seconds, 60),
    digits
  );
}


/**
 * Average time helper.
 */
export function averageTime(values = [], digits = 2) {
  return average(values, digits);
}



/* =========================================================
   DIFFICULTY HELPERS
========================================================= */

/**
 * Convert numeric score into label.
 *
 * DEFAULT MODEL:
 * 0.00 - 0.39 => easy
 * 0.40 - 0.69 => medium
 * 0.70 - 1.00 => hard
 *
 * IMPORTANT:
 * This is ANALYTICS DIFFICULTY.
 * NOT teacher-defined difficulty.
 */
export function difficultyLabel(score) {
  const n = clamp(toNumber(score));

  if (n >= 0.7) {
    return "hard";
  }

  if (n >= 0.4) {
    return "medium";
  }

  return "easy";
}


/**
 * Confidence estimator based on sample size.
 */
export function confidenceFromAttempts(attempts) {
  const count = toNumber(attempts);

  if (count >= 500) {
    return "very_high";
  }

  if (count >= 200) {
    return "high";
  }

  if (count >= 50) {
    return "medium";
  }

  if (count >= 10) {
    return "low";
  }

  return "very_low";
}



/* =========================================================
   SORTING HELPERS
========================================================= */

/**
 * Sort descending by numeric field.
 */
export function sortDescBy(items = [], field) {
  return [...items].sort((a, b) => {
    return toNumber(b[field]) - toNumber(a[field]);
  });
}


/**
 * Sort ascending by numeric field.
 */
export function sortAscBy(items = [], field) {
  return [...items].sort((a, b) => {
    return toNumber(a[field]) - toNumber(b[field]);
  });
}



/* =========================================================
   GROUPING HELPERS
========================================================= */

/**
 * Group array by field.
 */
export function groupBy(items = [], key) {
  return items.reduce((groups, item) => {

    const value =
      typeof key === "function"
        ? key(item)
        : item[key];

    if (!groups[value]) {
      groups[value] = [];
    }

    groups[value].push(item);

    return groups;

  }, {});
}



/* =========================================================
   ANALYTICS STATUS HELPERS
========================================================= */

/**
 * Determine whether analytics is statistically usable.
 */
export function hasSufficientData(
  attempts,
  minimum = 10
) {
  return toNumber(attempts) >= minimum;
}


/**
 * Build a standardized analytics metadata object.
 */
export function buildAnalyticsMeta({
  attempts = 0,
  updatedAt = null
} = {}) {

  return {
    attempts: toNumber(attempts),
    confidence: confidenceFromAttempts(attempts),
    hasSufficientData: hasSufficientData(attempts),
    updatedAt
  };
}