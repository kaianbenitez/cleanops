/** The form's submit lifecycle as one value rather than three independent
 * `useState`s. Modelling it as a union makes the impossible combinations
 * (submitting *and* showing a stale error, an error *and* a success result)
 * unrepresentable. */
export type Submission =
  | { state: "idle" }
  | { state: "submitting" }
  | { state: "error"; message: string }
  | { state: "done"; created: number; skipped: number };
