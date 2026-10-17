import type { Config } from 'tailwindcss';

const v = (name: string) => `var(--${name})`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: v('canvas'),
        surface: v('surface'),
        raised: v('raised'),
        subtle: v('subtle'),
        line: v('line'),
        ink: v('ink'),
        muted: v('muted'),
        accent: v('accent'),
        'accent-ink': v('accent-ink'),
        'accent-soft': v('accent-soft'),
        success: v('success'),
        'success-soft': v('success-soft'),
        warning: v('warning'),
        'warning-soft': v('warning-soft'),
        danger: v('danger'),
        'danger-soft': v('danger-soft'),
        'side-bg': v('side-bg'),
        'side-bg2': v('side-bg2'),
        'side-line': v('side-line'),
        'side-ink': v('side-ink'),
        'side-muted': v('side-muted'),
        'side-accent': v('side-accent'),
        'side-active': v('side-active'),
        info: v('info'),
        'info-soft': v('info-soft'),
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'] },
      fontSize: { base: ['14px', '20px'], sm: ['13px', '18px'], xs: ['12px', '16px'] },
      borderRadius: { DEFAULT: '8px', lg: '10px', xl: '14px' },
      boxShadow: { soft: '0 1px 2px rgb(20 24 32 / 0.06)', pop: '0 8px 24px rgb(20 24 32 / 0.14)' },
    },
  },
  plugins: [],
};
export default config;
