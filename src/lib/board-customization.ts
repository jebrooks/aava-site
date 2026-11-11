import configurations from '../data/board-customizations.json' with { type: 'json' };

export interface BoardSelections {
  preference: 'With meat' | 'No meat';
  cheeses: string[];
  meats: string[];
  accompaniments: string[];
}

export type LineAttribute = { key: string; value: string };

export function getBoardConfiguration(handle: string) {
  return configurations[handle as keyof typeof configurations] || null;
}

export function boardAttributes(handle: string, input: unknown): LineAttribute[] {
  const config = getBoardConfiguration(handle);
  if (!config) {
    if (input != null) throw new Error('This board does not support ingredient selections.');
    return [];
  }
  if (!input || typeof input !== 'object') {
    throw new Error('Choose ingredients on the build-your-own product page before adding this board.');
  }
  const selections = input as Record<string, unknown>;
  if (selections.preference !== 'With meat' && selections.preference !== 'No meat') {
    throw new Error('Choose whether to include meat.');
  }
  const noMeat = selections.preference === 'No meat';
  const groups = [
    { key: 'cheeses', label: 'Cheeses', options: config.cheeses, max: noMeat ? config.maxVegetarianCheeses : config.maxCheeses, min: 1 },
    { key: 'meats', label: 'Meats', options: config.meats, max: noMeat ? 0 : config.maxMeats, min: noMeat ? 0 : 1 },
    { key: 'accompaniments', label: 'Accompaniments', options: config.accompaniments, max: config.maxAccompaniments, min: 1 },
  ];
  const attributes = [{ key: 'Board preference', value: selections.preference }];
  for (const group of groups) {
    const values = selections[group.key];
    if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !group.options.includes(value))) {
      throw new Error(`Choose ${group.label.toLowerCase()} from the available ingredients.`);
    }
    if (new Set(values).size !== values.length) throw new Error('Each ingredient can only be selected once.');
    if (values.length < group.min || values.length > group.max) {
      throw new Error(group.max === 0 ? 'Remove meat selections for a board without meat.' : `Choose ${group.min}–${group.max} ${group.label.toLowerCase()}.`);
    }
    // Canonical ordering keeps identical boards together and different selections on separate lines.
    attributes.push({ key: group.label, value: group.options.filter(option => values.includes(option)).join('; ') || 'None' });
  }
  return attributes;
}

export function assertBoardLine(handle: string, attributes: LineAttribute[]) {
  if (!getBoardConfiguration(handle)) return;
  const values = Object.fromEntries(attributes.map(attribute => [attribute.key, attribute.value]));
  const list = (key: string) => !values[key] || values[key] === 'None' ? [] : values[key].split('; ');
  boardAttributes(handle, {
    preference: values['Board preference'],
    cheeses: list('Cheeses'),
    meats: list('Meats'),
    accompaniments: list('Accompaniments'),
  });
}
