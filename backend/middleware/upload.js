const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const uploadDirectory = path.join(__dirname, "..", "uploads");

fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedExtensions = [".pdf", ".docx", ".txt"];

const storage = multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, uploadDirectory);
    },

    filename: function (req, file, callback) {
        const extension = path.extname(file.originalname).toLowerCase();
        const uniqueName =
            Date.now() + "-" + crypto.randomBytes(8).toString("hex") + extension;

        callback(null, uniqueName);
    }
});

function fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.includes(extension)) {
        return callback(
            new Error("Only PDF, DOCX, and TXT files are allowed.")
        );
    }

    callback(null, true);
}

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

module.exports = upload;
