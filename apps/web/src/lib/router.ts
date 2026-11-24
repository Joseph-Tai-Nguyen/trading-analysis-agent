import { useEffect, useState } from "react";

// Tiny hash router: #/  #/watchlists  #/symbol/AAPL  #/settings
// Hash routing keeps the Worker's SPA fallback trivial and works offline as a PWA.

export type Route =
  | { name: "portfolio" }
  | { name: "watchlists" }
  | { name: "symbol"; symbol: string }
  | { name: "settings" };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  switch (parts[0]) {
    case "watchlists":
      return { name: "watchlists" };
    case "settings":
      return { name: "settings" };
    case "symbol":
      if (parts[1]) return { name: "symbol", symbol: decodeURIComponent(parts[1]).toUpperCase() };
      return { name: "portfolio" };
    default:
      return { name: "portfolio" };
  }
}

export const href = {
  portfolio: "#/",
  watchlists: "#/watchlists",
  settings: "#/settings",
  symbol: (s: string) => `#/symbol/${encodeURIComponent(s)}`,
};

export function navigate(to: string) {
  window.location.hash = to.replace(/^#/, "");
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
