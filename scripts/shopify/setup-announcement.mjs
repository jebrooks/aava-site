import { adminGraphql, assertUserErrors } from './lib.mjs';

const type = 'announcement_banner';
const existing = await adminGraphql(`query {
  metaobjectDefinitionByType(type: "announcement_banner") { id }
  metaobjectByHandle(handle: { type: "announcement_banner", handle: "default" }) { id }
}`);

if (!existing.metaobjectDefinitionByType) {
  const result = await adminGraphql(
    `mutation CreateAnnouncementDefinition($definition: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $definition) {
        metaobjectDefinition { id }
        userErrors { field message }
      }
    }`,
    { definition: {
      name: 'Announcement banner',
      type,
      description: 'Website header banner. Edit the default entry. Dates include the full day in America/New_York; leave either date blank for no limit.',
      displayNameKey: 'message',
      fieldDefinitions: [
        { name: 'Enabled', key: 'enabled', type: 'boolean', required: true, description: 'Turn off to hide the banner regardless of dates.' },
        { name: 'Message', key: 'message', type: 'single_line_text_field', required: true },
        { name: 'Link label', key: 'link_label', type: 'single_line_text_field', description: 'Underlined call to action, such as Order now.' },
        { name: 'Link URL', key: 'link_url', type: 'single_line_text_field', description: 'An internal path such as /charcuterie, or a full https:// URL. Leave blank for a text-only banner.' },
        { name: 'Start date', key: 'start_date', type: 'date', description: 'First day to display, starting at midnight Eastern Time. Optional.' },
        { name: 'End date', key: 'end_date', type: 'date', description: 'Last day to display, through 11:59 PM Eastern Time. Optional; must be on or after the start date.' },
      ],
    } },
  );
  assertUserErrors(result.metaobjectDefinitionCreate, 'Creating announcement banner definition');
}

if (!existing.metaobjectByHandle) {
  const result = await adminGraphql(
    `mutation CreateAnnouncement($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject { id handle }
        userErrors { field message }
      }
    }`,
    { metaobject: { type, handle: 'default', fields: [
      { key: 'enabled', value: 'true' },
      { key: 'message', value: 'Celebrate Women-Owned Businesses — nominate one you love and receive $20 off your next order.' },
      { key: 'link_label', value: 'Order now' },
      { key: 'link_url', value: '/charcuterie' },
    ] } },
  );
  assertUserErrors(result.metaobjectCreate, 'Creating announcement banner');
}

const verified = await adminGraphql(`query {
  metaobjectByHandle(handle: { type: "announcement_banner", handle: "default" }) {
    handle fields { key }
  }
}`);
if (!verified.metaobjectByHandle) throw new Error('Announcement banner verification failed.');
console.log('Announcement banner ready: Shopify Admin → Content → Metaobjects → Announcement banner. Existing content was preserved.');
