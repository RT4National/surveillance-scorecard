import type { HistoryOptions } from "../../src/ingestion/history";

/**
 * User decisions for the 2026-10-15 history import. Excluded criteria are listed for the user
 * rather than guessed; the cosponsorship extras come from the legacy wording and inventory notes.
 */
export const historyOptions: HistoryOptions = {
  excludedKeys: {
    first_usaf_cloture_vote:
      "Composite GOOD/OK/BAD criterion combining a PATRIOT reauthorization vote (114-1-195) with a USA Freedom cloture vote (114-1-194, or 113-2-282 / 114-1-196); needs a decision on how to score a two-vote combination. Roll call 195 is imported once under straight_reauth.",
    final_passage_usaf:
      "Legacy never says which chamber (House roll 224 of 2015 or Senate 114-1-201), and the BAD branch combines final passage with a PATRIOT extension vote.",
    voted_for_massie_lofgren_amendment_2014:
      "Most likely the same vote (House 2014 roll 327) as massie_lofgren_amendment_to_hr4870_no_backdoors; imported once under that key to avoid double counting.",
  },
  cosponsorExtras: {
    usa_freedom_prior_to_20140518: {
      bills: [{ congress: 113, type: "s", number: 1599 }],
      signedBefore: "2014-05-18",
    },
  },
};
