import BorderGlow from "./BorderGlow";
import { GLOW_DEFAULTS } from "./glowDefaults";

/** BorderGlow wrapper with shared BrainS hover defaults */
export default function GlowCard({
  children,
  className = "",
  borderRadius = 12,
  animated = false,
  ...props
}) {
  return (
    <BorderGlow
      className={`w-full h-full ${className}`}
      borderRadius={borderRadius}
      animated={animated}
      {...GLOW_DEFAULTS}
      {...props}>
      {children}
    </BorderGlow>
  );
}
