/**
 * Whether a rendered video needs a human to approve it before it can publish.
 *
 * One line, in its own module, because of where it is needed. `queue.mjs` owns
 * the review gate but imports `validate-plan.mjs` for `isPortableItemId`, so
 * the plan validator cannot import `queue.mjs` back to ask whether the gate is
 * on — the cycle deadlocks at the top-level await and the validator prints
 * nothing at all.
 *
 * The alternative was to re-read `process.env.REQUIRE_APPROVAL` at the second
 * call site with its own copy of the default. Two copies of a safety default
 * is how one of them ends up inverted: a validator cheerfully reporting
 * "review gate is ON" while the publisher, reading a different default, ships
 * unattended.
 */

/**
 * On unless explicitly switched off. The default is the safe direction: a
 * misspelt or missing value leaves the gate standing rather than opening it.
 */
export const requiresApproval = () => process.env.REQUIRE_APPROVAL !== "0";

/** Unreviewed until stated otherwise — an entry with no field is not approved. */
export const approvalOf = (entry) => entry.approval ?? "pending";

export const APPROVAL_STATES = ["pending", "approved", "rejected"];
