import { BLACKOUT_HANDLE, BLACKOUT_TYPE, parseBlackoutDates } from '../blackout-dates.ts';
type Graphql = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

export async function loadSharedBlackoutDates(graphql: Graphql): Promise<string[]> {
  const result = await graphql<{ metaobjectByHandle: { fields: Array<{ key: string; value: string | null }> } | null }>(
    `query SharedBlackoutDates($handle:MetaobjectHandleInput!){metaobjectByHandle(handle:$handle){fields{key value}}}`,
    { handle: { type: BLACKOUT_TYPE, handle: BLACKOUT_HANDLE } },
  );
  if (!result.metaobjectByHandle) throw new Error(`Create the ${BLACKOUT_TYPE}/${BLACKOUT_HANDLE} Shopify metaobject first.`);
  return parseBlackoutDates(result.metaobjectByHandle.fields.find(field => field.key === 'dates')?.value);
}
