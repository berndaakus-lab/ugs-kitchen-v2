/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,jsx}',
    './src/components/**/*.{js,jsx}',
    './src/context/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#E85D04',
          dark:   '#1A0A00',
          cream:  '#FFF8F0',
          muted:  '#F5EDE0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        drawer: '0 -8px 40px rgba(0,0,0,0.18)',
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in':  'fadeIn 0.25s ease-out',
        'pulse-slow': 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        slideUp: {
          '0%':   { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
