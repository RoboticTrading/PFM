/**
 * The artifact navigation spine. In PFM the artifacts ARE the navigation —
 * object-centric, not intent-based. Add an artifact area here and it appears in
 * the sidebar and the command palette.
 */
export interface NavItem {
  href: string;
  label: string;
  /** Single-character glyph for the dense sidebar. */
  glyph: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", glyph: "◫" },
  { href: "/accounts", label: "Accounts", glyph: "▤" },
  { href: "/categories", label: "Categories", glyph: "❡" },
  { href: "/positions", label: "Positions", glyph: "◆" },
] as const;

/** The nav item whose section contains `pathname` (longest-prefix match). */
export function activeNav(pathname: string): NavItem | undefined {
  return [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
}
