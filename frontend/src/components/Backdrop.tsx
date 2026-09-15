/**
 * The thing the glass is looking at.
 *
 * Frosted panels are only worth having when there is something coloured moving
 * behind them, so this is not wallpaper — it is the light source the whole
 * design depends on. Two blurred orbs, indigo and amber, drift on long
 * out-of-phase cycles so the panes never refract quite the same thing twice.
 *
 * Deliberately slow: 34s and 44s, out of phase, so it reads as ambient light
 * rather than an animation demanding to be watched. Frozen entirely under
 * prefers-reduced-motion, where it becomes a plain static gradient.
 */
export function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Base gradient: night at the top, the low warm horizon at the bottom. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(178deg, #070B16 0%, #101A38 40%, #172C55 70%, #2B3A63 100%)',
        }}
      />

      {/* Indigo light, upper left. */}
      <div
        className="absolute h-[70vh] w-[70vh] animate-drift-a rounded-full"
        style={{
          top: '-22vh',
          left: '-14vh',
          background: 'radial-gradient(circle, rgba(52, 96, 190, 0.55) 0%, rgba(52, 96, 190, 0) 68%)',
          filter: 'blur(28px)',
        }}
      />

      {/* Amber light, lower right: the horizon the panes pick up as warmth. */}
      <div
        className="absolute h-[62vh] w-[62vh] animate-drift-b rounded-full"
        style={{
          bottom: '-24vh',
          right: '-10vh',
          background: 'radial-gradient(circle, rgba(201, 138, 60, 0.52) 0%, rgba(201, 138, 60, 0) 66%)',
          filter: 'blur(30px)',
        }}
      />

      {/* A third, small and cool, to stop the two large orbs reading as a
          symmetrical pair. */}
      <div
        className="absolute h-[34vh] w-[34vh] animate-drift-b rounded-full"
        style={{
          top: '38%',
          right: '26%',
          background: 'radial-gradient(circle, rgba(31, 164, 142, 0.24) 0%, rgba(31, 164, 142, 0) 70%)',
          filter: 'blur(34px)',
          animationDelay: '-12s',
        }}
      />

      {/* Grain. Without it the large blurred fields band badly on 8-bit panels,
          which is the tell that turns "glass" into "gradient". */}
      <div
        className="absolute inset-0 opacity-[0.16] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  )
}
