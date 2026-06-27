import multer from "multer";
import { createRequire } from "module";
import cloudinary from "../config/cloudinary.js";

const require = createRequire(import.meta.url);
const cloudinaryStorage = require("multer-storage-cloudinary");

const storage = cloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "chat-images",
        allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
        trnsformation: [{ width: 800, height: 600, crop: "limmit" }, { quality: "auto" }],
    } as any,
});

export const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("only image allowed"));
        }
    },
});