import express from "express"
import multer from "multer"
import pdf from "pdf-parse"

const app = express()
const upload = multer({ storage: multer.memoryStorage() })

const PORT = process.env.PORT || 8080

function cleanText(text = "") {
  return String(text)
    .replace(/\u0000/g, "")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00A0]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function splitPages(text = "") {
  const raw = String(text || "")
  if (!raw.trim()) return []

  const parts = raw
    .split(/\f/g)
    .map((t) => cleanText(t))
    .filter(Boolean)

  if (parts.length > 1) {
    return parts.map((pageText, index) => ({
      pageNumber: index + 1,
      text: pageText,
    }))
  }

  return [
    {
      pageNumber: 1,
      text: cleanText(raw),
    },
  ]
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "eduai-paper-parser",
    status: "running",
  })
})

app.post("/parse", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió archivo." })
    }

    const filename = req.file.originalname || "document.pdf"
    const baseName = filename.replace(/\.[^/.]+$/, "")

    const data = await pdf(req.file.buffer)

    const text = cleanText(data.text || "")
    const pages = splitPages(text)

    return res.json({
      success: !!text,
      parser: "light-pdf-parser",
      method: "pdf-parse-api",
      title: baseName,
      markdown: text,
      text,
      pageCount: pages.length || data.numpages || 1,
      pages,
      ocrUsed: false,
      metadata: {
        filename,
        mimeType: req.file.mimetype,
        info: data.info || null,
        numpages: data.numpages || 0,
      },
    })
  } catch (error) {
    console.error("[Paper Parser] error:", error)
    return res.status(500).json({
      success: false,
      parser: "light-pdf-parser",
      method: "pdf-parse-api",
      error: error?.message || "Error procesando documento.",
    })
  }
})

app.listen(PORT, () => {
  console.log(`Paper parser running on port ${PORT}`)
})
