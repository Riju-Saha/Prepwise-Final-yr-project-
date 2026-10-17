
const mysql = require("mysql2/promise");
require("dotenv").config();

const db = mysql.createPool({
    // Use the configured host, or default to IPv4 localhost.
    host: process.env.DB_HOST || "127.0.0.1",

    // Your XAMPP MySQL is currently running on port 3305.
    port: Number(process.env.DB_PORT || 3305),

    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "prepwise_db",

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = db;
