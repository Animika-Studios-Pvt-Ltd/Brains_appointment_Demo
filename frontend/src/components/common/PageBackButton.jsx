import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

/**
 * Shared back control — matches doctor detail page (circular icon + label).
 */
export default function PageBackButton({
  onClick,
  to,
  className = "",
  label = "Back",
  ariaLabel = "Go back",
}) {
  const navigate = useNavigate();

  const handleClick =
    onClick ??
    (() => {
      navigate(-1);
    });

  const inner = (
    <>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_4px_12px_rgba(0,0,0,0.06)] border border-slate-200/80 text-[#008cc9] transition-transform duration-500 group-hover:-rotate-[360deg]"
        aria-hidden>
        <ArrowLeft className="h-4 w-4" strokeWidth={3} />
      </span>
      <span>{label}</span>
    </>
  );

  const sharedClassName = `group hidden sm:inline-flex items-center gap-3 text-sm font-bold text-[#002e62] hover:opacity-85 transition-opacity cursor-pointer font-body ${className}`;

  if (to) {
    return (
      <Link to={to} aria-label={ariaLabel} className={sharedClassName}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={handleClick} aria-label={ariaLabel} className={sharedClassName}>
      {inner}
    </button>
  );
}
