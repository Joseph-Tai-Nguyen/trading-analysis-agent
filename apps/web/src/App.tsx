import { useEffect } from "react";
import { NavBar } from "./components/NavBar";
import { ErrorNote, Spinner } from "./components/ui";
import { useAsync } from "./hooks/useAsync";
import { api, ApiError } from "./lib/api";
import { useRoute } from "./lib/router";
import { LoginPage } from "./pages/LoginPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SymbolPage } from "./pages/SymbolPage";
import { WatchlistsPage } from "./pages/WatchlistsPage";

export function App() {
  const route = useRoute();
  const status = useAsync(() => api.status(), []);

  const { setData, reload } = status;
  useEffect(() => {
    // Any 401 from the API (e.g. session expired) re-checks status → shows the login page.
    const onUnauthorized = () => {
      setData(undefined);
      void reload();
    };
    window.addEventListener("taa:unauthorized", onUnauthorized);
    return () => window.removeEventListener("taa:unauthorized", onUnauthorized);
  }, [setData, reload]);

  if (!status.data && status.loading) return <Spinner label="Starting…" />;
  if (status.error instanceof ApiError && (status.error.status === 401 || status.error.status === 403)) {
    return <LoginPage message={status.error.status === 403 ? status.error.message : undefined} />;
  }
  if (!status.data) {
    return (
      <main className="page">
        <ErrorNote error={status.error ?? new Error("Signed out")} />
        <a className="btn primary" href="/auth/login">Sign in</a>
      </main>
    );
  }

  const s = status.data;
  return (
    <>
      <NavBar route={route} user={s.user!} />
      <main className="main">
        {route.name === "portfolio" && <PortfolioPage />}
        {route.name === "watchlists" && <WatchlistsPage />}
        {route.name === "symbol" && <SymbolPage key={route.symbol} symbol={route.symbol} />}
        {route.name === "settings" && <SettingsPage status={s} />}
      </main>
    </>
  );
}
