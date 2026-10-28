import 'server-only';
import { unstable_cache } from 'next/cache';
import { listAllUsers, listAllWorkspaces, sumMembers } from './api';

/** Every workspace, read once a minute and shared by the counts and the workspace detail page. */
export const allWorkspaces = unstable_cache(listAllWorkspaces, ['tms-all-workspaces'], { revalidate: 60 });

/** Every account, read once a minute. Workspace members are worked out from it. */
export const allUsers = unstable_cache(listAllUsers, ['tms-all-users'], { revalidate: 60 });

/**
 * People who belong to a workspace, summed from the workspace list. This is what "users" means in the panel's People count:
 * the API's own users.total counts every registered account, including sign-ups that never created or joined a workspace.
 */
export async function peopleInWorkspaces(): Promise<{ people: number; workspaces: number }> {
  const all = await allWorkspaces();
  return { people: sumMembers(all), workspaces: all.length };
}
