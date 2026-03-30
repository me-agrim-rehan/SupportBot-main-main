// Backend/routes/compose.js

import express from "express";
import multer from "multer";
import csvParser from "csv-parser";
import fs from "fs";

import { sendMessage } from "../../services/whatsapp.js";
import { addMessage } from "../../store/conversations.js";
import { requireAdmin } from "../../middleware/auth.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

/**
 * 🔥 SEND (single OR multiple numbers)
 */
router.post("/send", requireAdmin, async (req, res) => {
    let { to, message } = req.body;

    if (!to || !message) {
        return res.status(400).json({ error: "to and message required" });
    }

    // 👉 support multiple numbers (comma / newline / space)
    let numbers = [];

    if (Array.isArray(to)) {
        numbers = to;
    } else {
        numbers = to
            .split(/[\n, ]+/)
            .map((n) => n.trim())
            .filter(Boolean);
    }

    const results = [];

    try {
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

        res.json({
            success: true,
            total: numbers.length,
            results,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to send" });
    }
});

/**
 * 📢 BULK CSV (unchanged)
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

            await new Promise((resolve, reject) => {
                fs.createReadStream(req.file.path)
                    .pipe(csvParser())
                    .on("data", (row) => {
                        if (row.phone) numbers.push(row.phone);
                    })
                    .on("end", resolve)
                    .on("error", reject);
            });

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
                } catch {
                    results.push({ number, status: "failed" });
                }
            }

            fs.unlinkSync(req.file.path);

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