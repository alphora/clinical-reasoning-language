import type { MvFlag } from '@smile-digital-health/crl';

/** KE owns extraction content until MV accepts it; rejection closes it. Validation content belongs to MV, regardless of creator or tag. */
export const isAuthoringFlag = (flag: Pick<MvFlag,'category'>): boolean => flag.category === 'extraction';
