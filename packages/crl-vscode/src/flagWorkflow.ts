import type { MvFlag } from '@smile-digital-health/crl';

/** KE owns extraction content. MV answers by creating its own flag or ignores by resolving KE. */
export const isAuthoringFlag = (flag: Pick<MvFlag,'category'>): boolean => flag.category === 'extraction';
