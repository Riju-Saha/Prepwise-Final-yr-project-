function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            message: "Please log in to continue."
        });
    }

    next();
}

module.exports = { requireAuth };
