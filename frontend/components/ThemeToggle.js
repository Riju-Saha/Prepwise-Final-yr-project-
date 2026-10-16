import { useEffect, useState } from "react";

export default function ThemeToggle() {
    const [theme, setTheme] = useState("light");
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const savedTheme = localStorage.getItem("prepwise-theme");
        const initialTheme =
            savedTheme === "dark" ? "dark" : "light";

        document.documentElement.dataset.theme = initialTheme;
        setTheme(initialTheme);
        setReady(true);
    }, []);

    function toggleTheme() {
        const nextTheme = theme === "light" ? "dark" : "light";

        document.documentElement.dataset.theme = nextTheme;
        localStorage.setItem("prepwise-theme", nextTheme);
        setTheme(nextTheme);
    }

    return (
        <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={
                theme === "light"
                    ? "Switch to dark mode"
                    : "Switch to light mode"
            }
            title={
                theme === "light"
                    ? "Switch to dark mode"
                    : "Switch to light mode"
            }
            disabled={!ready}
        >
            <span aria-hidden="true">
                {theme === "light" ? "☾" : "☀"}
            </span>

            <span className="theme-toggle-label">
                {theme === "light" ? "Dark mode" : "Light mode"}
            </span>
        </button>
    );
}
