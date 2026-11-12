import { adminGraphql } from "./lib.mjs";
import { syncTourBoards } from "../../src/lib/shopify/tour-board-sync.ts";
const result = await syncTourBoards(
  adminGraphql,
  process.env.SHOPIFY_CHARCUTERIE_COLLECTION_HANDLE || "charcuterie",
  !process.argv.includes("--apply"),
);
console.log(JSON.stringify(result, null, 2));
