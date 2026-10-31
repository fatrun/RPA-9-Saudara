/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bordo: {
          50: '#FDF2F4',
          100: '#FBE6E9',
          200: '#F5C2C9',
          300: '#ED94A0',
          400: '#DE5D70',
          500: '#991B2B',
          600: '#801724',
          DEFAULT: '#6C151E', // Palet Bordo Resmi
          700: '#6C151E',
          800: '#541017',
          900: '#3D0B11',
          950: '#26060A',
        },
        rpaGreen: {
          50: '#F0F7F6',
          100: '#DBEDEB',
          200: '#B6DBD7',
          300: '#87C2BC',
          400: '#4D9991',
          500: '#1E6E67',
          600: '#15544E',
          DEFAULT: '#0F3D3A', // Palet Green Resmi
          700: '#0F3D3A',
          800: '#0B2D2B',
          900: '#08211F',
          950: '#041211',
        },
        cream: {
          50: '#FDFBF7',
          100: '#FAF5EE',
          200: '#F5EADB',
          DEFAULT: '#F5DABF', // Palet Cream Resmi
          300: '#F5DABF',
          400: '#E8C5A0',
          500: '#D6A878',
          600: '#B88651',
          700: '#8C6236',
          800: '#614223',
          900: '#3D2813',
        },
        surface: {
          DEFAULT: '#FAF8F5',
          card: '#FFFFFF',
          subtle: '#F4EFEA',
          border: '#EADCCF',
          dark: '#1A1816',
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
          '"Apple Color Emoji"',
        ],
      },
      borderRadius: {
        'ios': '26px',
        'ios-sm': '18px',
        'ios-lg': '32px',
      },
      boxShadow: {
        'ios-modal': '0 25px 60px -15px rgba(15, 61, 58, 0.25), 0 0 1px 1px rgba(108, 21, 30, 0.05)',
        'ios-card': '0 8px 30px rgba(0, 0, 0, 0.04)',
        'ios-hover': '0 14px 34px rgba(15, 61, 58, 0.12)',
      }
    },
  },
  plugins: [],
}
