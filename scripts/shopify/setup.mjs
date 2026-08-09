import { adminGraphql, assertUserErrors } from './lib.mjs';

const rawSchedule = process.env.DELIVERY_SCHEDULE_JSON;
if (!rawSchedule) throw new Error('DELIVERY_SCHEDULE_JSON is required for initial setup.');
const schedule = JSON.parse(rawSchedule);
if (!Number.isInteger(schedule.dailyCapacity) || schedule.dailyCapacity < 1) {
  throw new Error('DELIVERY_SCHEDULE_JSON.dailyCapacity must be a positive integer.');
}

const definitionQuery = await adminGraphql(`query {
  metaobjectDefinitionByType(type: "delivery_schedule") {
    id
    fieldDefinitions { key }
  }
}`);

if (!definitionQuery.metaobjectDefinitionByType) {
  const created = await adminGraphql(
    `mutation CreateScheduleDefinition($definition: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $definition) {
        metaobjectDefinition { id }
        userErrors { field message }
      }
    }`,
    {
      definition: {
        name: 'Delivery schedule',
        type: 'delivery_schedule',
        fieldDefinitions: [
          { name: 'Eligible ZIP codes', key: 'eligible_zips', type: 'multi_line_text_field', required: true },
          { name: 'Daily order capacity', key: 'daily_capacity', type: 'number_integer', required: true },
          { name: 'Lead time in hours', key: 'lead_time_hours', type: 'number_integer', required: true },
          { name: 'Horizon in days', key: 'horizon_days', type: 'number_integer', required: true },
          { name: 'Blackout dates', key: 'blackout_dates', type: 'multi_line_text_field' },
          { name: 'Weekly windows JSON', key: 'weekly_windows', type: 'json', required: true },
        ],
      },
    },
  );
  assertUserErrors(created.metaobjectDefinitionCreate, 'Creating delivery schedule definition');
} else if (!definitionQuery.metaobjectDefinitionByType.fieldDefinitions.some(
  (field) => field.key === 'daily_capacity',
)) {
  const updated = await adminGraphql(
    `mutation AddDailyCapacity(
      $id: ID!
      $definition: MetaobjectDefinitionUpdateInput!
    ) {
      metaobjectDefinitionUpdate(id: $id, definition: $definition) {
        metaobjectDefinition { id }
        userErrors { field message }
      }
    }`,
    {
      id: definitionQuery.metaobjectDefinitionByType.id,
      definition: {
        fieldDefinitions: [{
          create: {
            name: 'Daily order capacity',
            key: 'daily_capacity',
            type: 'number_integer',
          },
        }],
      },
    },
  );
  assertUserErrors(updated.metaobjectDefinitionUpdate, 'Adding daily capacity field');
}

const existing = await adminGraphql(`query {
  metaobjectByHandle(handle: { type: "delivery_schedule", handle: "default" }) { id }
}`);
const fields = [
  { key: 'eligible_zips', value: schedule.eligibleZips.join('\n') },
  { key: 'daily_capacity', value: String(schedule.dailyCapacity) },
  { key: 'lead_time_hours', value: String(schedule.leadTimeHours) },
  { key: 'horizon_days', value: String(schedule.horizonDays) },
  { key: 'blackout_dates', value: (schedule.blackoutDates || []).join('\n') },
  { key: 'weekly_windows', value: JSON.stringify(schedule.weeklyWindows) },
];

if (existing.metaobjectByHandle) {
  const updated = await adminGraphql(
    `mutation UpdateSchedule($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject { id handle }
        userErrors { field message }
      }
    }`,
    { id: existing.metaobjectByHandle.id, metaobject: { fields } },
  );
  assertUserErrors(updated.metaobjectUpdate, 'Updating delivery schedule');
} else {
  const created = await adminGraphql(
    `mutation CreateSchedule($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject { id handle }
        userErrors { field message }
      }
    }`,
    { metaobject: { type: 'delivery_schedule', handle: 'default', fields } },
  );
  assertUserErrors(created.metaobjectCreate, 'Creating delivery schedule');
}

const metafields = [
  ['Serving count', 'serving_count', 'single_line_text_field'],
  ['Ingredients', 'ingredients', 'multi_line_text_field'],
  ['Allergens', 'allergens', 'multi_line_text_field'],
  ['Dietary labels', 'dietary_labels', 'list.single_line_text_field'],
  ['Preparation hours', 'preparation_hours', 'number_integer'],
];

for (const [name, key, type] of metafields) {
  const lookup = await adminGraphql(
    `query MetafieldDefinition($identifier: MetafieldDefinitionIdentifierInput!) {
      metafieldDefinition(identifier: $identifier) { id }
    }`,
    { identifier: { namespace: 'custom', key, ownerType: 'PRODUCT' } },
  );
  if (lookup.metafieldDefinition) continue;
  const created = await adminGraphql(
    `mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition { id }
        userErrors { field message }
      }
    }`,
    { definition: { name, namespace: 'custom', key, type, ownerType: 'PRODUCT' } },
  );
  assertUserErrors(created.metafieldDefinitionCreate, `Creating ${key} metafield`);
}

console.log('Shopify delivery schedule and product metafields are configured.');
