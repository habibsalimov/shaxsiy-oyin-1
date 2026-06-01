import { createContext, useContext, useState, useEffect } from 'react';

// ─── Theme Definitions ─────────────────────────────────────────────────────
const themes = {
    system: {
        id: 'system',
        label: 'Tizim',
        icon: '\u25D0',
    },
    light: {
        id: 'light',
        label: 'Yorug\u2018',
        icon: '\u2600\ufe0f',
        colors: {
            '--bg': '#D8CBB2',
            '--bg-card': '#FFFDF8',
            '--bg-input': '#E2D8C5',
            '--bg-section': '#EDE4D4',
            '--bg-section-open': '#F8F3E9',
            '--border': '#BEAE92',
            '--border-strong': '#9A8666',
            '--border-input': '#A4937A',
            '--text': '#232830',
            '--text-secondary': '#525C68',
            '--text-muted': '#79838F',
            '--accent': '#B07B00',
            '--accent-dim': '#8A6000',
            '--accent-glow': 'rgba(176,123,0,0.22)',
            '--accent-bg': 'rgba(176,123,0,0.15)',
            '--accent-bg-subtle': 'rgba(176,123,0,0.09)',
            '--active-ring': '#2563eb',
            '--active-band': '#EDE4D4',
            '--green': '#157f3b',
            '--green-bg': 'rgba(21,127,59,0.17)',
            '--green-bg-strong': 'rgba(21,127,59,0.26)',
            '--red': '#cc2020',
            '--red-bg': 'rgba(204,32,32,0.13)',
            '--red-bg-strong': 'rgba(204,32,32,0.20)',
            '--orange': '#cb6d00',
            '--orange-bg': 'rgba(203,109,0,0.15)',
            '--grid-line': 'rgba(120,86,26,0.065)',
            '--scrollbar-track': '#E4DCCE',
            '--scrollbar-thumb': '#C7BCA8',
            '--row-hover': 'rgba(61,46,30,0.055)',
            '--row-border': 'rgba(61,46,30,0.15)',
            '--header-bg': 'rgba(255,253,248,0.97)',
            '--title-color': '#2E2212',
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
            '--active-ring': '#f5c800',
            '--active-band': 'rgba(245,200,0,0.07)',
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
const THEME_ORDER = ['dark', 'light', 'system'];

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    const [themeId, setThemeId] = useState(() => {
        try {
            const savedTheme = localStorage.getItem(THEME_KEY);
            return THEME_ORDER.includes(savedTheme) ? savedTheme : 'dark';
        }
        catch { return 'dark'; }
    });
    const [systemThemeId, setSystemThemeId] = useState(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    });

    const theme = themes[themeId] || themes.dark;
    const resolvedTheme = themeId === 'system' ? themes[systemThemeId] : theme;

    useEffect(() => {
        try { localStorage.setItem(THEME_KEY, themeId); } catch { }
        const root = document.documentElement;
        for (const [prop, value] of Object.entries(resolvedTheme.colors)) {
            root.style.setProperty(prop, value);
        }
    }, [themeId, resolvedTheme]);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const media = window.matchMedia('(prefers-color-scheme: light)');
        const updateSystemTheme = () => setSystemThemeId(media.matches ? 'light' : 'dark');

        updateSystemTheme();
        media.addEventListener?.('change', updateSystemTheme);
        return () => media.removeEventListener?.('change', updateSystemTheme);
    }, []);

    const cycleTheme = () => {
        setThemeId(prev => {
            const currentIdx = THEME_ORDER.indexOf(prev);
            return THEME_ORDER[(currentIdx + 1) % THEME_ORDER.length];
        });
    };

    return (
        <ThemeContext.Provider value={{ theme, themeId, resolvedTheme, systemThemeId, setThemeId, cycleTheme, themes }}>
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
