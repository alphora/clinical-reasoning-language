import type { MvFlag } from '@smile-digital-health/crl';

/** Authoring owns extraction content; MV may resolve it. Validation content belongs to MV, regardless of creator. */
export const isAuthoringFlag = (flag: Pick<MvFlag,'category'>): boolean => flag.category === 'extraction';
