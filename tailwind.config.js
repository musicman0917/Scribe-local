/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.html', './public/js/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fffdea',
          100: '#fff9c2',
          200: '#fff085',
          300: '#ffe042',
          400: '#ffcc0d',
          500: '#f9b000',
          600: '#dd8600',
          700: '#b75f04',
          800: '#94490b',
          900: '#7a3c0d',
          950: '#461d02'
        }
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(0,0,0,0.05), 0 1px 3px 0 rgba(0,0,0,0.06)'
      }
    }
  },
  plugins: []
};
