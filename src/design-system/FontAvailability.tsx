import { createContext, useContext } from "react";
export const FontAvailability = createContext(true);
export const useBrandFonts = () => useContext(FontAvailability);
