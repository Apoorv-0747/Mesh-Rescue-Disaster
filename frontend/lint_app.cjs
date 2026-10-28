const fs = require('fs');
const babel = require('@babel/core');

const code = fs.readFileSync('src/App.jsx', 'utf8');

try {
    const result = babel.transformSync(code, {
        presets: ['@babel/preset-react'],
        plugins: ['@babel/plugin-syntax-jsx']
    });
    console.log("Babel parse successful.");
} catch (e) {
    console.error("Babel error:", e.message);
}
