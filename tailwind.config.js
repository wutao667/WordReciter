/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
      },
      borderRadius: {
        card: '1.5rem',
        modal: '1.75rem',
        button: '1rem',
        badge: '9999px',
        input: '1rem',
      },
      boxShadow: {
        card: '0 18px 45px -24px rgba(15, 23, 42, 0.35)',
        'card-hover': '0 24px 60px -28px rgba(79, 70, 229, 0.35)',
        button: '0 12px 24px -16px rgba(15, 23, 42, 0.55)',
        modal: '0 28px 80px -32px rgba(15, 23, 42, 0.45)',
        input: 'inset 0 1px 2px rgba(15, 23, 42, 0.06)',
      },
      fontSize: {
        label: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.12em', fontWeight: '800' }],
        button: ['0.8125rem', { lineHeight: '1.125rem', fontWeight: '800' }],
        caption: ['0.6875rem', { lineHeight: '0.875rem', fontWeight: '700' }],
      },
    },
  },
  plugins: [],
};
