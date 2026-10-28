import 'server-only';
import { unstable_cache } from 'next/cache';
import { listAllWorkspaces, sumMembers } from './api';

/**
 * People who belong to a workspace, summed from the workspace list. This is what "users" means in the panel:
 * the API's own users.total counts every registered account, including sign-ups that never created or joined a workspace.
 */
export const peopleInWorkspaces = unstable_cache(async (): Promise<{ people: number; workspaces: number }> => {
  const all = await listAllWorkspaces();
  return { people: sumMembers(all), workspaces: all.length };
}, ['tms-people-in-workspaces'], { revalidate: 60 });
