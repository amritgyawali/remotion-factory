"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/plan", label: "Plan" },
  { href: "/runs", label: "Runs" },
  { href: "/videos", label: "Videos" },
  { href: "/channels", label: "Channels" },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections" className="scroll-x -mx-1">
      <ul className="flex items-center gap-1 px-1">
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className="block rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors"
                style={{
                  background: active ? "var(--wash)" : "transparent",
                  color: active ? "var(--ink)" : "var(--ink-secondary)",
                }}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
