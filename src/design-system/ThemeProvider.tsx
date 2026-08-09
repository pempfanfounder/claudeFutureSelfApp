import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_PALETTE,
  THEMES,
  themeById,
  toPalette,
  type Palette,
  type Theme,
} from "./themes";

const THEME_STORAGE_KEY = "fs.theme.v1";

interface ThemeContextValue {
  theme: Theme;
  palette: Palette;
  setThemeId: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES[0]!,
  palette: DEFAULT_PALETTE,
  setThemeId: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(THEMES[0]!);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (cancelled || !stored) return;
      const found = themeById(stored);
      if (found) setTheme(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemeId = useCallback((id: string) => {
    const found = themeById(id);
    if (!found) return;
    setTheme(found);
    AsyncStorage.setItem(THEME_STORAGE_KEY, id).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ theme, palette: toPalette(theme), setThemeId }),
    [theme, setThemeId],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function useColors(): Palette {
  return useContext(ThemeContext).palette;
}
