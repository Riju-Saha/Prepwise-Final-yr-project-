
const bcrypt = require("bcryptjs");
const db = require("../config/db");

const REMEMBER_ME_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

async function register(req, res) {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email, and password are required."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must contain at least 8 characters."
            });
        }

        const cleanName = String(name).trim();
        const cleanEmail = String(email).trim().toLowerCase();

        if (!cleanName || !cleanEmail) {
            return res.status(400).json({
                message: "Please enter a valid name and email."
            });
        }

        const [existingUsers] = await db.execute(
            "SELECT id FROM users WHERE email = ?",
            [cleanEmail]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({
                message: "An account with this email already exists."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const [result] = await db.execute(
            `INSERT INTO users (name, email, password_hash)
             VALUES (?, ?, ?)`,
            [cleanName, cleanEmail, passwordHash]
        );

        const user = {
            id: result.insertId,
            name: cleanName,
            email: cleanEmail
        };

        // New registrations use a browser-session cookie by default.
        req.session.user = user;
        req.session.cookie.expires = false;

        req.session.save((error) => {
            if (error) {
                console.error("Registration session error:", error);

                return res.status(500).json({
                    message: "Account created, but could not start your session. Please log in."
                });
            }

            return res.status(201).json({
                message: "Account created successfully.",
                user
            });
        });
    } catch (error) {
        console.error("Registration error:", error);

        return res.status(500).json({
            message: "Could not create your account."
        });
    }
}

async function login(req, res) {
    try {
        const { email, password, rememberMe } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required."
            });
        }

        const cleanEmail = String(email).trim().toLowerCase();

        const [users] = await db.execute(
            `SELECT id, name, email, password_hash
             FROM users
             WHERE email = ?`,
            [cleanEmail]
        );

        if (
            users.length === 0 ||
            !(await bcrypt.compare(password, users[0].password_hash))
        ) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const user = {
            id: users[0].id,
            name: users[0].name,
            email: users[0].email
        };

        const shouldRemember =
            rememberMe === true || rememberMe === "true";

        // Regenerate the session ID after successful authentication.
        req.session.regenerate((error) => {
            if (error) {
                console.error("Session error:", error);

                return res.status(500).json({
                    message: "Could not start your session."
                });
            }

            req.session.user = user;

            if (shouldRemember) {
                // Persist the cookie for 30 days.
                req.session.cookie.maxAge = REMEMBER_ME_DURATION;
            } else {
                // Do not set a persistent cookie.
                req.session.cookie.expires = false;
            }

            req.session.save((saveError) => {
                if (saveError) {
                    console.error("Session save error:", saveError);

                    return res.status(500).json({
                        message: "Could not save your session."
                    });
                }

                return res.json({
                    message: "Login successful.",
                    user
                });
            });
        });
    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            message: "Could not log in."
        });
    }
}

function me(req, res) {
    res.set("Cache-Control", "no-store");

    return res.json({
        user: req.session?.user || null
    });
}

function logout(req, res) {
    res.set("Cache-Control", "no-store");

    if (!req.session) {
        res.clearCookie("prepwise.sid", {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: false
        });

        return res.json({
            message: "Already logged out."
        });
    }

    req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({
                message: "Could not log out."
            });
        }

        res.clearCookie("prepwise.sid", {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: false
        });

        return res.json({
            message: "Logged out successfully."
        });
    });
}

module.exports = {
    register,
    login,
    me,
    logout
};
