import { adminGraphql, assertUserErrors } from './lib.mjs';

const type = 'announcement_banner';
const description = 'Scheduled website announcements. Format Content with inline links, bold, and italics. Dates include full Eastern days. Overlaps prefer latest start date, then latest edit.';
const fields = [
  { name: 'Name', key: 'message', type: 'single_line_text_field', required: true, description: 'Administrative name to identify this announcement. Only Content appears on the site.' },
  { name: 'Content', key: 'content', type: 'rich_text_field', required: true, description: 'Banner text. Add formatting and inline links using the editor.' },
  { name: 'Enabled', key: 'enabled', type: 'boolean', required: true },
  { name: 'Start date', key: 'start_date', type: 'date', description: 'Optional first day, from midnight Eastern Time.' },
  { name: 'End date', key: 'end_date', type: 'date', description: 'Optional last day, through 11:59 PM Eastern Time.' },
];

async function updateDefinition(id, changes) {
  const result = await adminGraphql(`mutation UpdateBannerDefinition($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
    metaobjectDefinitionUpdate(id: $id, definition: $definition) {
      metaobjectDefinition { id } userErrors { field message }
    }
  }`, { id, definition: changes });
  assertUserErrors(result.metaobjectDefinitionUpdate, 'Updating announcement definition');
}

const { metaobjectDefinitionByType: existing } = await adminGraphql(`query {
  metaobjectDefinitionByType(type: "announcement_banner") { id fieldDefinitions { key } }
}`);
if (!existing) {
  const result = await adminGraphql(`mutation CreateBannerDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition { id } userErrors { field message }
    }
  }`, { definition: { name: 'Announcement banner', type, description, displayNameKey: 'message', fieldDefinitions: fields } });
  assertUserErrors(result.metaobjectDefinitionCreate, 'Creating announcement definition');
} else {
  const keys = new Set(existing.fieldDefinitions.map(field => field.key));
  const missing = fields.filter(field => !keys.has(field.key));
  if (missing.length) {
    await updateDefinition(existing.id, { fieldDefinitions: missing.map(field => ({ create: { ...field, required: false } })) });
  }
  let after = null;
  do {
    const result = await adminGraphql(`query BannerEntries($after: String) {
      metaobjects(type: "announcement_banner", first: 100, after: $after) {
        nodes { id fields { key value } } pageInfo { hasNextPage endCursor }
      }
    }`, { after });
    for (const entry of result.metaobjects.nodes) {
      const values = Object.fromEntries(entry.fields.map(field => [field.key, field.value]));
      if (values.content) continue;
      const children = [{ type: 'text', value: values.message || 'Announcement' }];
      if (values.link_url && values.link_label) children.push(
        { type: 'text', value: ' ' },
        { type: 'link', url: values.link_url, children: [{ type: 'text', value: values.link_label }] },
      );
      const content = JSON.stringify({ type: 'root', children: [{ type: 'paragraph', children }] });
      const updated = await adminGraphql(`mutation MigrateBanner($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
          metaobject { id fields { key value } } userErrors { field message }
        }
      }`, { id: entry.id, metaobject: { fields: [{ key: 'content', value: content }] } });
      assertUserErrors(updated.metaobjectUpdate, 'Migrating announcement content');
      if (!updated.metaobjectUpdate.metaobject?.fields.some(field => field.key === 'content' && field.value === content)) {
        throw new Error('Rich content verification failed; legacy fields have not been removed.');
      }
    }
    after = result.metaobjects.pageInfo.hasNextPage ? result.metaobjects.pageInfo.endCursor : null;
  } while (after);
  await updateDefinition(existing.id, {
    description, displayNameKey: 'message',
    fieldDefinitions: [
      ...fields.map(({ type: _type, ...field }) => ({ update: field })),
      ...['link_label', 'link_url'].filter(key => keys.has(key)).map(key => ({ delete: { key } })),
    ],
  });
}
console.log('Announcement banner ready: Name, rich-text Content, Enabled, Start date, End date.');
