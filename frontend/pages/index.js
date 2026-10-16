
import { useState } from "react";
import { useRouter } from "next/router";
import { apiRequest } from "../config/api";
import ThemeToggle from "../components/ThemeToggle";

export default function Home() {
    const router = useRouter();

    const [mode, setMode] = useState("login");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [rememberMe, setRememberMe] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();

        setBusy(true);
        setError("");

        try {
            const endpoint =
                mode === "login"
                    ? "/auth/login"
                    : "/auth/register";

            const body =
                mode === "login"
                    ? { email, password, rememberMe }
                    : { name, email, password };

            await apiRequest(endpoint, {
                method: "POST",
                body: JSON.stringify(body)
            });

            await router.replace("/dashboard");
        } catch (err) {
            setError(err.message || "Something went wrong. Please try again.");
        } finally {
            setBusy(false);
        }
    }

    function switchMode() {
        setMode((current) =>
            current === "login" ? "register" : "login"
        );
        setError("");
        setPassword("");
        setRememberMe(false);
        setShowPassword(false);
    }

    return (
        <main className="landing">
            <nav className="nav">
                <a className="brand" href="/">
                    PrepWise<span>.</span>
                </a>

                <div className="nav-actions">
                    <span className="nav-note">
                        Your career preparation workspace
                    </span>

                    <ThemeToggle />
                </div>
            </nav>

            <section className="hero">
                <div className="hero-copy">
                    <p className="eyebrow">
                        CAREER PREPARATION, MADE CLEAR
                    </p>

                    <h1>
                        Make your resume work{" "}
                        <span>smarter.</span>
                    </h1>

                    <p className="hero-text">
                        Organize your resumes and job descriptions
                        in one place. PrepWise is designed to help
                        you prepare for the roles you want.
                    </p>

                    <div className="feature-list">
                        <div>
                            <span className="feature-icon">01</span>
                            <div>
                                <b>Organize your resumes</b>
                                <p>
                                    Upload and manage your resume files.
                                </p>
                            </div>
                        </div>

                        <div>
                            <span className="feature-icon">02</span>
                            <div>
                                <b>Save target roles</b>
                                <p>
                                    Keep job descriptions ready for review.
                                </p>
                            </div>
                        </div>

                        <div>
                            <span className="feature-icon">03</span>
                            <div>
                                <b>Prepare with purpose</b>
                                <p>
                                    Build toward resume matching and
                                    skill-gap insights.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="auth-card">
                    <div className="card-mark">P</div>

                    <h2>
                        {mode === "login"
                            ? "Welcome back"
                            : "Create your account"}
                    </h2>

                    <p className="muted">
                        {mode === "login"
                            ? "Log in to continue to PrepWise."
                            : "Start preparing for your next opportunity."}
                    </p>

                    <form onSubmit={handleSubmit}>
                        {mode === "register" && (
                            <label>
                                Full name
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(event) =>
                                        setName(event.target.value)
                                    }
                                    placeholder="Your name"
                                    autoComplete="name"
                                    required
                                />
                            </label>
                        )}

                        <label>
                            Email address
                            <input
                                type="email"
                                value={email}
                                onChange={(event) =>
                                    setEmail(event.target.value)
                                }
                                placeholder="you@example.com"
                                autoComplete="email"
                                required
                            />
                        </label>

                        <label>
                            Password

                            <div className="password-field">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(event) =>
                                        setPassword(event.target.value)
                                    }
                                    placeholder="At least 8 characters"
                                    autoComplete={
                                        mode === "login"
                                            ? "current-password"
                                            : "new-password"
                                    }
                                    minLength={8}
                                    required
                                />

                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() =>
                                        setShowPassword((previous) => !previous)
                                    }
                                    aria-label={
                                        showPassword
                                            ? "Hide password"
                                            : "Show password"
                                    }
                                    title={
                                        showPassword
                                            ? "Hide password"
                                            : "Show password"
                                    }
                                >
                                    {showPassword ? "🙈" : "👁"}
                                </button>
                            </div>
                        </label>

                        {mode === "login" && (
                            <label className="remember-me">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(event) =>
                                        setRememberMe(event.target.checked)
                                    }
                                />

                                <span>Remember me on this device</span>
                            </label>
                        )}

                        {error && (
                            <p className="error">{error}</p>
                        )}

                        <button
                            className="primary-btn"
                            type="submit"
                            disabled={busy}
                        >
                            {busy
                                ? "Please wait..."
                                : mode === "login"
                                    ? "Log in"
                                    : "Create account"}

                            <span>→</span>
                        </button>
                    </form>

                    <p className="switch-text">
                        {mode === "login"
                            ? "New to PrepWise?"
                            : "Already have an account?"}{" "}

                        <button
                            type="button"
                            className="text-btn"
                            onClick={switchMode}
                        >
                            {mode === "login"
                                ? "Create an account"
                                : "Log in"}
                        </button>
                    </p>
                </div>
            </section>

            <footer>
                © {new Date().getFullYear()} PrepWise
                {" "}· Built for your next opportunity
            </footer>
        </main>
    );
}
