import AsyncStorage from "@react-native-async-storage/async-storage";

import { ownedStorage } from "@/lib/accountStorage";
import { captureIdentity } from "@/lib/appState";
const pinnedKey = (id: string) => `fs.widget.pinned.v2.${id}`;

/** Default pinned line when the user hasn't chosen one yet. */
export const DEFAULT_PINNED = "I am becoming.";

/**
 * The persistent widget's text: the user's own line (edited in Widget
 * settings), falling back to their life goal, then the default. It
 * never changes until the user edits it.
 */
export async function getPinnedText(
  lifeGoal: string | null,
  identity = captureIdentity(),
): Promise<string> {
  const stored = await ownedStorage(identity, () =>
    AsyncStorage.getItem(pinnedKey(identity.userId!)),
  );
  if (stored && stored.trim().length > 0) return stored;
  if (lifeGoal && lifeGoal.trim().length > 0) return lifeGoal;
  return DEFAULT_PINNED;
}

export async function setPinnedText(text: string): Promise<void> {
  const identity = captureIdentity();
  await ownedStorage(identity, () =>
    AsyncStorage.setItem(pinnedKey(identity.userId!), text),
  );
}
