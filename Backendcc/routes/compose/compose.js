// Backend/routes/compose.js

import express from "express";
import multer from "multer";
import csvParser from "csv-parser";
import fs from "fs";

import { sendMessage } from "../../services/whatsapp.js";
import { addMessage } from "../../store/conversations.js";
import { requireAdmin } from "../../middleware/auth.js";

const router = express.Router();

// 📁 file upload config
const upload = multer({ dest: "uploads/" });

/**
 * 📤 SEND SINGLE MESSAGE
 */
router.post("/send", requireAdmin, async (req, res) => {
    const { to, message } = req.body;

    if (!to || !message) {
        return res.status(400).json({ error: "to and message required" });
    }

    try {
        const messageId = await sendMessage(to, message);

        await addMessage(to, "outgoing", message, messageId, "sent");

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to send" });
    }
});

/**
 * 📢 BULK SEND (CSV)
 * CSV format:
 * phone
 * 919876543210
 * 918888888888
 */
router.post(
    "/bulk",
    requireAdmin,
    upload.single("file"),
    async (req, res) => {
        const { message } = req.body;

        if (!req.file || !message) {
            return res.status(400).json({ error: "file + message required" });
        }

        const results = [];

        try {
            const numbers = [];

            // 📥 read CSV
            await new Promise((resolve, reject) => {
                fs.createReadStream(req.file.path)
                    .pipe(csvParser())
                    .on("data", (row) => {
                        if (row.phone) numbers.push(row.phone);
                    })
                    .on("end", resolve)
                    .on("error", reject);
            });

            // 📤 send messages
            for (const number of numbers) {
                try {
                    const messageId = await sendMessage(number, message);

                    await addMessage(
                        number,
                        "outgoing",
                        message,
                        messageId,
                        "sent"
                    );

                    results.push({ number, status: "sent" });
                } catch (err) {
                    results.push({ number, status: "failed" });
                }
            }

            fs.unlinkSync(req.file.path); // 🧹 cleanup

            res.json({
                success: true,
                total: numbers.length,
                results,
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Bulk send failed" });
        }
    }
);

export default router;