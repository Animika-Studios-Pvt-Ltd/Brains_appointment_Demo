import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  hospitalNavMenus,
  hospitalNavSecondary,
  HOSPITAL_SITE,
} from "@/config/hospitalNavLinks";
import "./HospitalHeader.css";

const NAV_LINK =
  "hospital-nav-link inline-block px-2 md:px-2 lg:px-2 xl:px-3 py-2 md:py-1.5 lg:py-2 text-[0.9375rem] md:text-[0.9375rem] lg:text-[0.9375rem] xl:text-[1rem] font-medium uppercase tracking-wide md:tracking-normal text-neutral-800 hover:text-[#134e97] transition whitespace-nowrap";

function isHospitalMarketingHref(href) {
  if (!href || typeof href !== "string") return false;
  try {
    const host = new URL(href).hostname.replace(/^www\./, "");
    return host === "brainshospital.com";
  } catch {
    return (
      href.startsWith(HOSPITAL_SITE) ||
      href.startsWith("https://brainshospital.com") ||
      href.startsWith("http://brainshospital.com")
    );
  }
}

function isPrimarySameTabClick(e) {
  return (
    !e.defaultPrevented &&
    e.button === 0 &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.shiftKey &&
    !e.altKey
  );
}

/** Remember app URL so Back from hospital site can restore this page */
function markAppReturnBeforeHospitalNav() {
  try {
    sessionStorage.setItem("brains-app-return", window.location.href);
  } catch {
    /* ignore */
  }
}

/** Same-tab link — browser Back returns to the appointment app */
function ExternalLink({ href, className, children, onClick, ...props }) {
  const handleClick = (e) => {
    if (isPrimarySameTabClick(e) && isHospitalMarketingHref(href)) {
      markAppReturnBeforeHospitalNav();
    }
    onClick?.(e);
  };

  return (
    <a {...props} href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}

/** 3-dot drawer + mobile secondary */
function SecondaryMenuLink({ href, className, children, onClose }) {
  const handleClick = (e) => {
    if (isPrimarySameTabClick(e) && isHospitalMarketingHref(href)) {
      markAppReturnBeforeHospitalNav();
    }
    onClose?.();
  };

  return (
    <a href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}

function DropdownItems({ items, onClose }) {
  return (
    <ul className="hospital-nav-dropdown__list" role="menu">
      {items.map((item) => (
        <li key={item.href} role="none">
          <ExternalLink
            href={item.href}
            role="menuitem"
            onClick={onClose}
            className="hospital-nav-dropdown__item">
            {item.label}
          </ExternalLink>
        </li>
      ))}
    </ul>
  );
}

function MegaMenuPanel({ columns, onClose }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2">
      {columns.map((col, ci) => (
        <ul key={ci} className="hospital-nav-dropdown__list" role="menu">
          {col.map((item) => (
            <li key={item.href} role="none">
              <ExternalLink
                href={item.href}
                role="menuitem"
                onClick={onClose}
                className="hospital-nav-dropdown__item">
                {item.label}
              </ExternalLink>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function MobileNavSubmenu({ menu, onClose }) {
  const hasMega = Boolean(menu.columns?.length);
  const flatItems = hasMega
    ? menu.columns.flat()
    : menu.items ?? [];

  return (
    <div className="hospital-mobile-nav__sub" role="menu">
      {flatItems.map((item) => (
        <ExternalLink
          key={item.href}
          href={item.href}
          role="menuitem"
          onClick={onClose}
          className="hospital-mobile-nav__sub-link">
          {item.label}
        </ExternalLink>
      ))}
    </div>
  );
}

function MobileNavMenuItem({ menu, isOpen, onToggle, onClose }) {
  const panelId = useId();
  const hasMega = Boolean(menu.columns?.length);
  const hasItems = Boolean(menu.items?.length);
  const hasDropdown = hasMega || hasItems;

  return (
    <li className="hospital-mobile-nav__group">
      <div className="hospital-mobile-nav__row">
        <ExternalLink
          href={menu.href}
          className="hospital-mobile-nav__label"
          onClick={onClose}>
          {menu.label}
        </ExternalLink>
        {hasDropdown ? (
          <button
            type="button"
            className="hospital-mobile-nav__chevron-btn"
            aria-expanded={isOpen}
            aria-controls={panelId}
            aria-label={`${isOpen ? "Collapse" : "Expand"} ${menu.label}`}
            onClick={() => onToggle(isOpen ? null : menu.id)}>
            <span
              className={`hospital-mobile-nav__caret ${isOpen ? "hospital-mobile-nav__caret--open" : ""}`}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      {hasDropdown && (
        <div
          id={panelId}
          className={`hospital-mobile-nav__sub-wrap ${isOpen ? "hospital-mobile-nav__sub-wrap--open" : ""}`}
          aria-hidden={!isOpen}>
          <MobileNavSubmenu menu={menu} onClose={onClose} />
        </div>
      )}
    </li>
  );
}

/** Last items sit near profile — open dropdowns to the left (not mega / left nav items) */
const DROPDOWN_ALIGN_END_FROM_INDEX = 3;

function NavMenuItem({ menu, isOpen, onToggle, onClose, isMobile, alignDropdownEnd }) {
  const panelId = useId();
  const hasMega = Boolean(menu.columns?.length);
  const hasItems = Boolean(menu.items?.length);
  const hasDropdown = hasMega || hasItems;

  if (isMobile) {
    return (
      <MobileNavMenuItem
        menu={menu}
        isOpen={isOpen}
        onToggle={onToggle}
        onClose={onClose}
      />
    );
  }

  return (
    <li
      className="relative group"
      onMouseEnter={hasDropdown ? () => onToggle(menu.id) : undefined}
      onMouseLeave={hasDropdown ? () => onToggle(null) : undefined}>
      <ExternalLink
        href={menu.href}
        className={`${NAV_LINK} ${isOpen ? "text-[#134e97]" : ""}`}
        onClick={onClose}>
        {menu.label}
      </ExternalLink>

      {isOpen && hasDropdown && (
        <div
          id={panelId}
          role="menu"
          className={`hospital-nav-dropdown ${hasMega ? "hospital-nav-dropdown--mega hospital-nav-dropdown--mega-anchor" : ""} ${alignDropdownEnd ? "hospital-nav-dropdown--align-end" : ""}`}>
          {hasMega ? (
            <MegaMenuPanel columns={menu.columns} onClose={onClose} />
          ) : (
            <DropdownItems items={menu.items} onClose={onClose} />
          )}
        </div>
      )}
    </li>
  );
}

function HamburgerIcon({ open, gradient = false }) {
  const wrapClass = gradient ? "hospital-more-menu__lines" : "hospital-mobile-nav__burger";
  const lineClass = gradient ? "hospital-more-menu__line" : "hospital-mobile-nav__burger-line";

  return (
    <span
      className={`${wrapClass} ${open && !gradient ? "hospital-mobile-nav__burger--open" : ""}`}
      aria-hidden>
      <span className={lineClass} />
      <span className={lineClass} />
      <span className={lineClass} />
    </span>
  );
}

function SecondarySidebarDrawer({ open, onClose }) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        type="button"
        className="hospital-side-drawer-backdrop"
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside
        className="hospital-side-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="More hospital links"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="hospital-side-drawer__close"
          aria-label="Close"
          onClick={onClose}>
          <X strokeWidth={1.5} />
        </button>
        <nav className="hospital-side-drawer__nav">
          {hospitalNavSecondary.map((link) => (
            <SecondaryMenuLink
              key={link.href}
              href={link.href}
              onClose={onClose}
              className="hospital-side-drawer__link">
              {link.label}
            </SecondaryMenuLink>
          ))}
        </nav>
      </aside>
    </>,
    document.body
  );
}

function SecondaryMenuButton({ open, onToggle, onClose }) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      const target = event.target;
      if (rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".hospital-side-drawer")) return;
      onClose();
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, onClose]);

  return (
    <div ref={rootRef} className="hospital-more-menu relative shrink-0">
      <button
        type="button"
        className="hospital-more-menu__trigger flex h-10 w-10 items-center justify-center text-neutral-900 hover:text-[#134e97] transition"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={open ? "Close more links" : "More links"}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}>
        <HamburgerIcon open={open} gradient />
      </button>
      <SecondarySidebarDrawer open={open} onClose={onClose} />
    </div>
  );
}

/** Nav links + profile + hamburger — sits beside logo on one row. */
export default function HospitalNavMenu({ profileSlot }) {
  const [openMenuId, setOpenMenuId] = useState(null);
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeAll = () => {
    setOpenMenuId(null);
    setSecondaryOpen(false);
    setMobileOpen(false);
  };

  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      setOpenMenuId(null);
      setSecondaryOpen(false);
      setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!mobileOpen && !secondaryOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen, secondaryOpen]);

  return (
    <div className="hospital-nav-menu-wrap flex flex-1 items-center min-w-0 self-stretch">
      {/* Desktop */}
      <nav
        className="hospital-nav-menu-wrap__desktop hidden md:flex items-center justify-center min-w-0 self-center overflow-visible"
        aria-label="Hospital sections">
        <ul className="hospital-nav-list">
          {hospitalNavMenus.map((menu, index) => (
            <NavMenuItem
              key={menu.id}
              menu={menu}
              isOpen={openMenuId === menu.id}
              onToggle={setOpenMenuId}
              onClose={closeAll}
              isMobile={false}
              alignDropdownEnd={
                index >= DROPDOWN_ALIGN_END_FROM_INDEX && !menu.columns?.length
              }
            />
          ))}
        </ul>
      </nav>

      <div className="hospital-header-actions hidden md:flex items-center gap-2 shrink-0 self-center">
        {profileSlot}
        <SecondaryMenuButton
          open={secondaryOpen}
          onToggle={() => {
            setSecondaryOpen((v) => !v);
            setOpenMenuId(null);
          }}
          onClose={() => setSecondaryOpen(false)}
        />
      </div>

      {/* Phone only — profile + hamburger (tablets use nav bar) */}
      <div className="hospital-header-mobile-actions flex md:hidden items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
        {profileSlot}
        <button
          type="button"
          className={`hospital-mobile-nav__toggle flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
            mobileOpen ? "hospital-mobile-nav__toggle--open" : ""
          }`}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((v) => !v)}>
          <HamburgerIcon open={mobileOpen} />
        </button>
      </div>

      {mobileOpen && (
        <>
          <button
            type="button"
            className="hospital-mobile-nav__backdrop hospital-mobile-nav__backdrop--in md:hidden"
            aria-label="Close menu"
            onClick={closeAll}
          />
          <nav
            className="hospital-mobile-nav hospital-mobile-nav--in md:hidden"
            aria-label="Hospital sections mobile">
            <ul className="hospital-mobile-nav__list">
              {hospitalNavMenus.map((menu) => (
                <NavMenuItem
                  key={menu.id}
                  menu={menu}
                  isOpen={openMenuId === menu.id}
                  onToggle={setOpenMenuId}
                  onClose={closeAll}
                  isMobile
                />
              ))}
            </ul>
            <ul className="hospital-mobile-nav__list hospital-mobile-nav__list--secondary">
              {hospitalNavSecondary.map((link) => (
                <li key={link.href}>
                  <SecondaryMenuLink
                    href={link.href}
                    onClose={closeAll}
                    className="hospital-mobile-nav__label hospital-mobile-nav__label--solo">
                    {link.label}
                  </SecondaryMenuLink>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </div>
  );
}
