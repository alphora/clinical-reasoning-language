import conceptTypesJson from './conceptTypes.json';
export const conceptTypes = conceptTypesJson as string[];
export type ConceptType = typeof conceptTypes[number]; 