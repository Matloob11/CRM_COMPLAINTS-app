/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // A deliberate, restrained scale. Everything in the app uses one of these
    // sizes; there are no ad-hoc font sizes anywhere in the components.
    fontSize: {
      '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }], // 11
      xs: ['0.75rem', { lineHeight: '1.125rem' }], // 12
      sm: ['0.8125rem', { lineHeight: '1.25rem' }], // 13
      base: ['0.875rem', { lineHeight: '1.375rem' }], // 14
      lg: ['1rem', { lineHeight: '1.5rem' }], // 16
      xl: ['1.125rem', { lineHeight: '1.625rem', letterSpacing: '-0.01em' }], // 18
      '2xl': ['1.375rem', { lineHeight: '1.875rem', letterSpacing: '-0.015em' }], // 22
      '3xl': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.02em' }], // 28
      '4xl': ['2.5rem', { lineHeight: '2.75rem', letterSpacing: '-0.03em' }], // 40
    },
    extend: {
      colors: {
        /*
         * Dusk over the Gulf: the palette these agents actually sell against.
         * Deep indigo night falling to a low amber horizon. It is also what
         * makes the glass worth having — frosted panels are only interesting
         * when there is something coloured behind them to refract.
         */
        dusk: {
          abyss: '#070B16',
          deep: '#101A38',
          tide: '#1B3A6B',
          dune: '#C98A3C',
          ember: '#E8A857',
        },

        /*
         * The neutral ramp is white-alpha rather than solid greys. On glass a
         * solid grey reads as a sticker sitting on top of the surface; an alpha
         * lets the backdrop through so borders and fills belong to the material.
         * Ordered so the existing semantics still hold: low numbers are quiet
         * fills and hairlines, high numbers are text.
         */
        ink: {
          50: 'rgba(255, 255, 255, 0.045)',
          100: 'rgba(255, 255, 255, 0.10)',
          200: 'rgba(255, 255, 255, 0.17)',
          300: 'rgba(226, 235, 252, 0.34)',
          400: 'rgba(230, 238, 253, 0.50)',
          500: 'rgba(233, 240, 252, 0.66)',
          600: 'rgba(238, 244, 253, 0.80)',
          700: 'rgba(242, 247, 254, 0.90)',
          800: '#EDF2FB',
          900: '#F6F9FF',
          950: '#FFFFFF',
        },

        // The backdrop paints itself; panes sit on it without their own fill.
        canvas: 'transparent',
        // The one glass fill. Everything that floats uses this plus .glass.
        surface: 'rgba(255, 255, 255, 0.055)',

        /*
         * Accent. Kept as a cool aqua so it never collides with the fixed
         * status palette, and so it reads as "interface" against the warm
         * amber that belongs to the horizon.
         */
        brand: {
          50: '#eafbf7',
          100: '#c8f3e9',
          200: '#96e6d6',
          300: '#5fd3be',
          400: '#35bda6',
          500: '#1fa48e',
          600: '#178474',
          700: '#156a5f',
          800: '#14544c',
          900: '#134540',
        },

        /*
         * Fixed status palette from CONTEXT.md, re-tuned for dark glass. Same
         * five meanings, same order: open = blue, in_progress = amber,
         * on_hold = slate, resolved = green, rejected = red. The light-mode
         * values were mixed for white paper and go muddy behind a blur, so the
         * hues are lifted and the tints become alphas of the hue itself.
         */
        status: {
          open: '#6FA8FF',
          'open-soft': 'rgba(111, 168, 255, 0.16)',
          'open-ink': '#BBD5FF',
          progress: '#F0B45C',
          'progress-soft': 'rgba(240, 180, 92, 0.16)',
          'progress-ink': '#FBDCA9',
          hold: '#93A3BE',
          'hold-soft': 'rgba(147, 163, 190, 0.16)',
          'hold-ink': '#CBD5E6',
          resolved: '#4FD69C',
          'resolved-soft': 'rgba(79, 214, 156, 0.16)',
          'resolved-ink': '#A9EDCC',
          rejected: '#FF8078',
          'rejected-soft': 'rgba(255, 128, 120, 0.16)',
          'rejected-ink': '#FFC0BB',
        },

        priority: {
          low: 'rgba(230, 238, 253, 0.45)',
          normal: 'rgba(230, 238, 253, 0.68)',
          high: '#F0B45C',
          urgent: '#FF8078',
        },
      },

      fontFamily: {
        /*
         * The native UI face, on purpose. Liquid glass is a material language
         * built around the system typeface, and inside a CRM iframe a webfont
         * costs a visible flash on every open for no gain the user can name.
         * Personality comes from the scale and the numerals, not the family.
         */
        sans: [
          'Segoe UI Variable Text',
          'Segoe UI',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'Inter',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: [
          'Segoe UI Variable Display',
          'Segoe UI',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'Inter',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },

      borderRadius: {
        bubble: '1.125rem',
        card: '1rem',
        pane: '1.25rem',
      },

      boxShadow: {
        // Glass reads as glass because of the inset top highlight, not the drop
        // shadow. The shadow only lifts it off the backdrop.
        glass:
          'inset 0 1px 0 0 rgba(255, 255, 255, 0.14), inset 0 0 0 1px rgba(255, 255, 255, 0.07), 0 18px 40px -24px rgba(3, 6, 16, 0.9)',
        bubble:
          'inset 0 1px 0 0 rgba(255, 255, 255, 0.10), 0 2px 10px -6px rgba(3, 6, 16, 0.7)',
        card: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.10), 0 10px 26px -18px rgba(3, 6, 16, 0.85)',
        pop: '0 24px 60px -20px rgba(3, 6, 16, 0.85), inset 0 1px 0 0 rgba(255, 255, 255, 0.16)',
        focus: '0 0 0 3px rgba(53, 189, 166, 0.38)',
      },

      keyframes: {
        'bubble-in': {
          '0%': { opacity: '0', transform: 'translateY(6px) scale(0.985)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'pane-in': {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-360px 0' },
          '100%': { backgroundPosition: '360px 0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        // The signature: two light sources drifting behind the glass, slowly
        // enough that you notice it only if you stop and look.
        'drift-a': {
          '0%, 100%': { transform: 'translate3d(-6%, -4%, 0) scale(1)' },
          '50%': { transform: 'translate3d(6%, 6%, 0) scale(1.12)' },
        },
        'drift-b': {
          '0%, 100%': { transform: 'translate3d(5%, 8%, 0) scale(1.08)' },
          '50%': { transform: 'translate3d(-7%, -3%, 0) scale(0.95)' },
        },
      },

      animation: {
        'bubble-in': 'bubble-in 180ms cubic-bezier(0.22, 1, 0.36, 1)',
        'fade-in': 'fade-in 160ms ease-out',
        'pane-in': 'pane-in 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        'pop-in': 'pop-in 160ms cubic-bezier(0.22, 1, 0.36, 1)',
        shimmer: 'shimmer 1.4s linear infinite',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        'drift-a': 'drift-a 34s ease-in-out infinite',
        'drift-b': 'drift-b 44s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
