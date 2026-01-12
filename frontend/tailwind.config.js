/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: '#0d0d0d',
                console: '#1a1a1a',
                border: '#333333',
                text: '#e0e0e0',
                'retro-green': {
                    light: '#33ff33',
                    dark: '#001100',
                    dim: '#008F11',
                },
                'retro-blue': {
                    light: '#33ccff',
                    dark: '#001122',
                    dim: '#0088cc',
                }
            },
            fontFamily: {
                'vt323': ['"VT323"', 'monospace'],
            }
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}
