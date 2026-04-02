import { useWindowDimensions } from "react-native";

const MOBILE_BREAKPOINT = 768;

/**
 * Returns true when the screen width is phone-sized,
 * whether on a real device or a mobile browser.
 */
export function useIsMobile(): boolean {
  const { width } = useWindowDimensions();
  return width < MOBILE_BREAKPOINT;
}
