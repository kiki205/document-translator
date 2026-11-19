require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const deepl = require("deepl-node");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const MAX_FILE_SIZE_MB = Math.max(1, Number(process.env.MAX_FILE_SIZE_MB || 30));
const API_KEY = process.env.DEEPL_API_KEY;

if (!API_KEY || API_KEY.includes("PASTE_YOUR")) {
  console.error("Missing DeepL API key. Copy .env.example to .env and add your key.");
  process.exit(1);
}

const translator = new deepl.DeepLClient(API_KEY);

app.use(helmet({
  // The app uses no external scripts, stylesheets, fonts, or images.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.static(path.join(__dirname, "public")));

const allowedExtensions = new Set([
  ".pdf", ".docx", ".pptx", ".xlsx", ".txt", ".html", ".htm",
  ".xlf", ".xliff", ".srt", ".vtt", ".jpeg", ".jpg", ".png"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!allowedExtensions.has(ext)) {
      return cb(new Error("Format file tidak didukung. Gunakan PDF, DOCX, PPTX, XLSX, TXT, HTML, XLIFF, SRT, VTT, JPG, atau PNG."));
    }
    cb(null, true);
  }
});

app.get("/api/languages", async (_req, res) => {
  try {
    const [targetLanguages, sourceLanguages] = await Promise.all([
      translator.getTargetLanguages(),
      translator.getSourceLanguages()
    ]);
    res.json({
      targets: targetLanguages.map(lang => ({
        code: lang.code,
        name: lang.name,
        supportsFormality: Boolean(lang.supportsFormality)
      })),
      sources: sourceLanguages.map(lang => ({
        code: lang.code,
        name: lang.name
      }))
    });
  } catch (error) {
    console.error("Language list error:", error.message);
    res.status(502).json({ error: "Tidak dapat mengambil daftar bahasa dari DeepL. Periksa API key dan koneksi internet." });
  }
});

app.post("/api/translate", upload.single("document"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Pilih dokumen terlebih dahulu." });
  }

  const targetLang = String(req.body.targetLang || "").trim().toUpperCase();
  const sourceInput = String(req.body.sourceLang || "").trim();
  const sourceLang = sourceInput ? sourceInput.toUpperCase() : null;

  if (!/^[A-Z]{2,3}(-[A-Z]{2})?$/.test(targetLang)) {
    return res.status(400).json({ error: "Bahasa tujuan tidak valid." });
  }
  if (sourceLang && !/^[A-Z]{2,3}(-[A-Z]{2})?$/.test(sourceLang)) {
    return res.status(400).json({ error: "Bahasa sumber tidak valid." });
  }
  if (sourceLang === targetLang) {
    return res.status(400).json({ error: "Bahasa sumber dan tujuan tidak boleh sama." });
  }

  const originalName = path.basename(req.file.originalname).replace(/[\r\n"]/g, "_");
  const ext = path.extname(originalName).toLowerCase();
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "document-translator-"));
  const inputPath = path.join(tempDir, `input${ext}`);
  const outputPath = path.join(tempDir, `translated${ext}`);

  try {
    await fs.promises.writeFile(inputPath, req.file.buffer);

    // A null source language asks DeepL to detect the document's language.
    await translator.translateDocument(
      inputPath,
      outputPath,
      sourceLang,
      targetLang,
      { timeoutMs: 60 * 60 * 1000 }
    );

    await fs.promises.access(outputPath, fs.constants.R_OK);
    const downloadName = `${path.parse(originalName).name}_${targetLang}${ext}`;

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
    res.setHeader("Cache-Control", "no-store");

    const stream = fs.createReadStream(outputPath);
    stream.on("error", error => {
      console.error("Download stream error:", error);
      if (!res.headersSent) res.status(500).end("Gagal membaca dokumen hasil.");
    });
    stream.on("close", () => {
      fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });
    stream.pipe(res);
  } catch (error) {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    console.error("Translation error:", error);

    const status = error.httpStatusCode;
    let message = "Penerjemahan gagal. Coba lagi atau periksa dokumen dan akun DeepL.";
    if (status === 401 || status === 403) message = "API key DeepL tidak valid atau tidak memiliki akses.";
    else if (status === 456) message = "Kuota atau batas penggunaan DeepL API sudah tercapai.";
    else if (status === 429) message = "Terlalu banyak permintaan ke DeepL. Tunggu sebentar lalu coba lagi.";
    else if (error.message && /timeout/i.test(error.message)) message = "Penerjemahan melewati batas waktu. Coba dokumen yang lebih kecil.";
    else if (error.message) message = error.message.slice(0, 300);

    if (!res.headersSent) res.status(502).json({ error: message });
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: `Ukuran dokumen melebihi batas ${MAX_FILE_SIZE_MB} MB.` });
  }
  if (err) {
    return res.status(400).json({ error: err.message || "Permintaan tidak valid." });
  }
  res.status(500).json({ error: "Terjadi kesalahan server." });
});

app.listen(PORT, HOST, () => {
  console.log(`Document Translator berjalan di http://${HOST}:${PORT}`);
  console.log("Tekan Ctrl+C untuk menghentikan server.");
});
