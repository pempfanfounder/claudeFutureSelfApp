import AsyncStorage from "@react-native-async-storage/async-storage";

const PINNED_KEY = "fs.widget.pinned.v1";

/** Default pinned line when the user hasn't chosen one yet. */
export const DEFAULT_PINNED = "I am becoming.";

/**
 * The persistent widget's text: the user's own line (edited in Widget
 * settings), falling back to their life goal, then the default. It
 * never changes until the user edits it.
 */
export async function getPinnedText(lifeGoal: string | null): Promise<string> {
  const stored = await AsyncStorage.getItem(PINNED_KEY);
  if (stored && stored.trim().length > 0) return stored;
  if (lifeGoal && lifeGoal.trim().length > 0) return lifeGoal;
  return DEFAULT_PINNED;
}

export async function setPinnedText(text: string): Promise<void> {
  await AsyncStorage.setItem(PINNED_KEY, text.trim());
}
