/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF9E6',
          100: '#FFF3CC',
          200: '#FFE799',
          300: '#FFDB66',
          400: '#FFCF33',
          500: '#FFC300',
          600: '#F5B800',
          700: '#E6AD00',
          800: '#D4A100',
          900: '#B88C00',
        },
        yellow: {
          50: '#FFFDF5',
          100: '#FFFCE6',
          200: '#FFF9CC',
          300: '#FFF599',
          400: '#FFF166',
          500: '#FFED33',
          600: '#FFE530',
          700: '#FFDA2B',
          800: '#FFCC25',
          900: '#FFB61D',
        },
        teal: {
          50: '#F0F9F6',
          100: '#D1EBE3',
          200: '#A3D6C9',
          300: '#75C0AE',
          400: '#47AB93',
          500: '#1A9578',
          600: '#15826A',
          700: '#126E5B',
          800: '#0E5B4D',
          900: '#0A443A',
        },
        coral: {
          50: '#FFF6F3',
          100: '#FFE8E1',
          200: '#FFD3C3',
          300: '#FFBEA5',
          400: '#FFA987',
          500: '#FF9469',
          600: '#E87D5A',
          700: '#D2664B',
          800: '#BB503C',
          900: '#A4392D',
        },
      },
      fontFamily: {
        sans: ['Nunito', 'sans-serif'],
        handwriting: ['Caveat', 'cursive'],
      },
      animation: {
        'bounce': 'bounce 1s infinite',
        'float': 'float 3s ease-in-out infinite',
        'wiggle': 'wiggle 1s ease-in-out infinite',
        'pop': 'pop 0.3s ease-out',
      },
      keyframes: {
        bounce: {
          '0%, 100%': { transform: 'translateY(-5%)' },
          '50%': { transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        pop: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
