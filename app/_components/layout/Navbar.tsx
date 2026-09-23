"use client";

import { useState, useEffect } from "react";
import { Menu, X, ArrowRight, Building2, Users } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/app/_components/theme/ThemeToggle";

const navLinks = [
  { name: "How It Works", href: "/how-it-works" },
  { name: "For Brands", href: "/for-brands" },
  { name: "For Creators", href: "/for-creators" },
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="w-full transition-all duration-300"
      style={{
        background: scrolled ? "var(--bg-navbar)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "blur(0px)",
        borderBottom: scrolled ? "1px solid var(--border-navbar)" : "1px solid transparent",
      }}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center min-h-11 shrink-0">
            <span
              className="font-display font-bold text-2xl tracking-tight"
              style={{
                background: "linear-gradient(90deg, #a78bfa 0%, #818cf8 40%, #f472b6 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Duolync
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 dark:text-slate-400 dark:hover:text-white text-slate-600 hover:text-slate-900 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-2.5">
            <ThemeToggle />
            <Link
              href="/auth"
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 hover:scale-[1.02]"
              style={{ background: "linear-gradient(135deg, #7c3aed, #ec4899)" }}
            >
              Get Started
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center gap-2">
            <ThemeToggle />
            <button
              className="inline-flex items-center justify-center min-w-11 min-h-11 rounded-xl transition-colors dark:text-slate-400 text-slate-600"
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Toggle menu"
            >
              {isOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isOpen && (
          <div
            className="md:hidden py-4 rounded-2xl mb-3 overflow-hidden"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-card)",
              backdropFilter: "blur(16px)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div className="flex flex-col px-2">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className="px-4 py-3 rounded-xl text-sm font-medium transition-all dark:text-slate-400 dark:hover:text-white text-slate-600 hover:text-slate-900 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                  onClick={() => setIsOpen(false)}
                >
                  {link.name}
                </Link>
              ))}

              <div
                className="mx-2 my-3"
                style={{ height: "1px", background: "var(--border-card)" }}
              />

              <div className="flex flex-col gap-2 px-2">
                <Link
                  href="/for-brands"
                  className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                  style={{ color: "#a78bfa" }}
                  onClick={() => setIsOpen(false)}
                >
                  <Building2 size={15} />
                  For Brands
                </Link>
                <Link
                  href="/for-creators"
                  className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                  style={{ color: "#f472b6" }}
                  onClick={() => setIsOpen(false)}
                >
                  <Users size={15} />
                  For Creators
                </Link>
                <Link
                  href="/auth"
                  className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold text-white mt-1 transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #ec4899)" }}
                  onClick={() => setIsOpen(false)}
                >
                  Get Started
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
