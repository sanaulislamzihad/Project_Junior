/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#f0fdfa',
                    100: '#ccfbf1',
                    200: '#99f6e4',
                    300: '#5eead4',
                    400: '#2dd4bf',
                    500: '#14b8a6', // Teal 500
                    600: '#0d9488', // Teal 600
                    700: '#0f766e',
                    800: '#115e59',
                    900: '#134e4a',
                }
            },
            animation: {
                'gradient-x': 'gradient-x 15s ease infinite',
                'float': 'float 6s ease-in-out infinite',
                'float-delayed': 'float 6s ease-in-out 3s infinite',
                'fade-in-up': 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'bubble': 'bubble 12s ease-in-out infinite',
            },
            keyframes: {
                'gradient-x': {
                    '0%, 100%': {
                        'background-size': '200% 200%',
                        'background-position': 'left center'
                    },
                    '50%': {
                        'background-size': '200% 200%',
                        'background-position': 'right center'
                    },
                },
                'float': {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-20px)' },
                },
                'fadeInUp': {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'bubble': {
                    '0%': { opacity: '0', transform: 'translateY(100%) scale(0.5)' },
                    '50%': { opacity: '0.4', transform: 'translateY(0%) scale(1)' },
                    '100%': { opacity: '0', transform: 'translateY(-100%) scale(0.5)' },
                }
            }
        },
    },
    plugins: [],
}
