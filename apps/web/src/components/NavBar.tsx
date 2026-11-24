import type { UserInfo } from "@taa/shared";
import { href, type Route } from "../lib/router";
import { SymbolSearch } from "./SymbolSearch";
import { navigate } from "../lib/router";

const TABS = [
  { name: "portfolio", label: "Portfolio", href: href.portfolio, icon: "◔" },
  { name: "watchlists", label: "Watchlists", href: href.watchlists, icon: "☆" },
  { name: "settings", label: "Settings", href: href.settings, icon: "⚙" },
] as const;

export function NavBar({ route, user }: { route: Route; user: UserInfo }) {
  return (
    <>
      <header className="topbar">
        <a className="brand" href={href.portfolio}>
          <img src="/icons/icon.svg" alt="" width={28} height={28} />
          <span>TradeAgent</span>
        </a>
        <nav className="tabs-desktop" aria-label="Main">
          {TABS.map((t) => (
            <a key={t.name} href={t.href} className={route.name === t.name ? "active" : ""}>
              {t.label}
            </a>
          ))}
        </nav>
        <div className="topbar-search">
          <SymbolSearch placeholder="Search symbol…" onPick={(s) => navigate(href.symbol(s))} />
        </div>
        <a className="avatar" href={href.settings} title={user.email}>
          {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : user.name.slice(0, 1)}
        </a>
      </header>
      <nav className="tabs-mobile" aria-label="Main">
        {TABS.map((t) => (
          <a key={t.name} href={t.href} className={route.name === t.name ? "active" : ""}>
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </a>
        ))}
      </nav>
    </>
  );
}
