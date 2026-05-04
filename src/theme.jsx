import { createContext, useContext, useState, useEffect } from 'react';

// ─── Theme Definitions ─────────────────────────────────────────────────────
const themes = {
    light: {
        id: 'light',
        label: 'Yorug\u2018',
        icon: '\u2600\ufe0f',
        colors: {
            '--bg': '#F5F0E8',
            '--bg-card': '#FFFFFF',
            '--bg-input': '#EDE8DE',
            '--bg-section': '#F0EBE1',
            '--bg-section-open': '#FAFAF7',
            '--border': '#D5CFC5',
            '--border-strong': '#C5BFB5',
            '--border-input': '#C5BFB5',
            '--text': '#2D3436',
            '--text-secondary': '#6B7280',
            '--text-muted': '#9CA3AF',
            '--accent': '#D4A017',
            '--accent-dim': '#B8890F',
            '--accent-glow': 'rgba(212,160,23,0.20)',
            '--accent-bg': 'rgba(212,160,23,0.10)',
            '--accent-bg-subtle': 'rgba(212,160,23,0.06)',
            '--green': '#16a34a',
            '--green-bg': 'rgba(22,163,74,0.10)',
            '--green-bg-strong': 'rgba(22,163,74,0.15)',
            '--red': '#dc2626',
            '--red-bg': 'rgba(220,38,38,0.08)',
            '--red-bg-strong': 'rgba(220,38,38,0.12)',
            '--orange': '#d97706',
            '--orange-bg': 'rgba(217,119,6,0.10)',
            '--grid-line': 'rgba(212,160,23,0.04)',
            '--scrollbar-track': '#EDE8DE',
            '--scrollbar-thumb': '#D5CFC5',
            '--row-hover': 'rgba(0,0,0,0.02)',
            '--row-border': 'rgba(0,0,0,0.06)',
            '--header-bg': 'rgba(255,255,255,0.95)',
            '--title-color': '#3D2E1E',
        }
    },
    dark: {
        id: 'dark',
        label: 'Qorong\u2018u',
        icon: '\ud83c\udf19',
        colors: {
            '--bg': '#0a0e1a',
            '--bg-card': '#111827',
            '--bg-input': '#1e2940',
            '--bg-section': '#0f1726',
            '--bg-section-open': '#161f30',
            '--border': '#1e2940',
            '--border-strong': '#2a3a52',
            '--border-input': '#445566',
            '--text': '#f0f4ff',
            '--text-secondary': '#8899aa',
            '--text-muted': '#445566',
            '--accent': '#f5c800',
            '--accent-dim': '#c9a200',
            '--accent-glow': 'rgba(245,200,0,0.25)',
            '--accent-bg': 'rgba(245,200,0,0.1)',
            '--accent-bg-subtle': 'rgba(245,200,0,0.07)',
            '--green': '#2ecc71',
            '--green-bg': 'rgba(46,204,113,0.12)',
            '--green-bg-strong': 'rgba(46,204,113,0.2)',
            '--red': '#e63946',
            '--red-bg': 'rgba(230,57,70,0.12)',
            '--red-bg-strong': 'rgba(230,57,70,0.15)',
            '--orange': '#f39c12',
            '--orange-bg': 'rgba(243,156,18,0.12)',
            '--grid-line': 'rgba(245,200,0,0.025)',
            '--scrollbar-track': '#111827',
            '--scrollbar-thumb': '#1e2940',
            '--row-hover': 'rgba(255,255,255,0.03)',
            '--row-border': 'rgba(255,255,255,0.04)',
            '--header-bg': 'rgba(17,24,39,0.97)',
            '--title-color': '#f5c800',
        }
    },
};

const THEME_KEY = 'shaxsiy-oyin-theme';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    const [themeId, setThemeId] = useState(() => {
        try { return localStorage.getItem(THEME_KEY) || 'dark'; }
        catch { return 'dark'; }
    });

    const theme = themes[themeId] || themes.dark;

    useEffect(() => {
        try { localStorage.setItem(THEME_KEY, themeId); } catch { }
        const root = document.documentElement;
        for (const [prop, value] of Object.entries(theme.colors)) {
            root.style.setProperty(prop, value);
        }
    }, [themeId, theme]);

    const cycleTheme = () => {
        setThemeId(prev => prev === 'dark' ? 'light' : 'dark');
    };

    return (
        <ThemeContext.Provider value={{ theme, themeId, setThemeId, cycleTheme, themes }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}

export function ThemeToggle() {
    const { theme, cycleTheme } = useTheme();
    return (
        <button
            onClick={cycleTheme}
            title={`Tema: ${theme.label}`}
            style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                padding: '5px 12px',
                cursor: 'pointer',
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--text-secondary)',
                fontFamily: 'inherit',
                fontWeight: 600,
                transition: 'all 0.2s',
                userSelect: 'none',
            }}
        >
            <span style={{ fontSize: 16 }}>{theme.icon}</span>
            <span style={{ fontSize: 10, letterSpacing: '0.06em' }}>{theme.label}</span>
        </button>
    );
}
