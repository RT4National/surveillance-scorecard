import {
  cosponsorshipItem,
  fetchBillSupport,
  type BillSupportStage,
} from "../src/ingestion/cosponsors";
import { HttpError } from "./auth";

export async function stageBillSupport(
  input: Record<string, unknown>,
  apiKey?: string,
  fetcher: typeof fetch = fetch,
): Promise<BillSupportStage> {
  const { congress, bill: label } = input;
  const billId =
    typeof label === "string"
      ? /^(hr|s|hres|sres|hjres|sjres|hconres|sconres)(\d+)$/i.exec(
          label.replace(/[.\s]/g, ""),
        )
      : null;
  if (
    typeof congress !== "number" ||
    !Number.isSafeInteger(congress) ||
    congress < 93 ||
    !billId ||
    !Number.isSafeInteger(Number(billId[2])) ||
    Number(billId[2]) <= 0
  )
    throw new HttpError(
      400,
      "Enter a Congress number and bill number, such as 119 and H.R. 2.",
    );
  if (!apiKey?.trim())
    throw new HttpError(
      503,
      "Congress.gov bill support intake is not configured.",
    );

  try {
    const { bill, cosponsors, sources } = await fetchBillSupport(
      { congress, type: billId[1].toLowerCase(), number: Number(billId[2]) },
      { apiKey, fetch: fetcher },
    );
    const { vote, records, withdrawn, withheld } = cosponsorshipItem(
      bill,
      cosponsors,
      {},
    );
    if (withheld.length)
      throw new HttpError(
        422,
        `Review party information for ${withheld.map(({ memberId }) => memberId).join(", ")} before importing.`,
      );
    return {
      ...vote,
      kind: "cosponsorship" as const,
      records,
      sources,
      warnings: withdrawn.length
        ? [`${withdrawn.length} withdrawn cosponsorships excluded.`]
        : [],
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      "Could not load the bill or verify its cosponsor totals from Congress.gov.",
    );
  }
}
