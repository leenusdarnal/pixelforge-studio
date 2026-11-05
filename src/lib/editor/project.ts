export const PROJECT_FORMAT = 'PixelForgeProject' as const;
export const PROJECT_VERSION = 3;

export type ProjectSnapshot = {
  format: typeof PROJECT_FORMAT;
  version: number;
  w: number;
  h: number;
  name: string;
  activeId: string | null;
  layers: unknown[];
  [key: string]: unknown;
};

export type RecoveryRecord = {
  id: string;
  savedAt: number;
  project: ProjectSnapshot;
};

/** Check the minimum stable project structure before restoring or autosaving data. */
export function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  if (!value || typeof value !== 'object') return false;
  const project = value as Record<string, unknown>;
  return project.format === PROJECT_FORMAT
    && Number.isSafeInteger(project.version)
    && Number.isSafeInteger(project.w)
    && Number.isSafeInteger(project.h)
    && typeof project.name === 'string'
    && Array.isArray(project.layers);
}
