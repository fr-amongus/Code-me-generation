import { eq } from 'drizzle-orm';
import { db, featureReleasesTable, usersTable } from '@workspace/db';

export const FEATURE_DEFINITIONS = [
  { key: 'admin-dashboard', label: 'Tableau administrateur', defaultAudience: 'admin' as const },
  { key: 'autocode', label: 'Auto-code', defaultAudience: 'all' as const },
];

export type FeatureKey = (typeof FEATURE_DEFINITIONS)[number]['key'];
export type FeatureAudience = 'all' | 'admin';

export function getFeatureDefinition(key: string) {
  return FEATURE_DEFINITIONS.find((feature) => feature.key === key);
}

export async function getFeatureAudience(key: FeatureKey): Promise<FeatureAudience> {
  const feature = getFeatureDefinition(key);
  if (!feature) throw new Error('Unknown feature');
  const [override] = await db
    .select({ audience: featureReleasesTable.audience })
    .from(featureReleasesTable)
    .where(eq(featureReleasesTable.key, key))
    .limit(1);
  return override?.audience === 'admin' || override?.audience === 'all'
    ? override.audience
    : feature.defaultAudience;
}

export async function userCanAccessFeature(userId: string | undefined, key: string): Promise<boolean> {
  const feature = getFeatureDefinition(key);
  if (!feature) return false;
  const audience = await getFeatureAudience(feature.key);
  if (audience === 'all') return true;
  if (!userId) return false;
  const [user] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user?.role === 'owner';
}
