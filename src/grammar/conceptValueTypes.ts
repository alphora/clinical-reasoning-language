import conceptValueTypesJson from './conceptValueTypes.json';
export const conceptValueTypes = conceptValueTypesJson as string[];
export type ConceptValueType = typeof conceptValueTypes[number]; 