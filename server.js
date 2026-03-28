import express from "express"
import multer from "multer"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

const app = express()
const upload = multer({ storage: multer.memoryStorage() })
const execFileAsync = promisify(execFile)

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

function buildPagesFromText(text = "") {
  const raw = String(text || "")
  if (!raw.trim()) return []

  const splitByFormFeed = raw.split(/\f/g).map(t => cleanText(t)).filter(Boolean)
  if (splitByFormFeed.length > 1) {
    return splitByFormFeed.map((pageText, index) => ({
      pageNumber: index + 1,
      text: pageText,
    }))
  }

  return [{ pageNumber: 1, text: cleanText(raw) }]
}

app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "eduai-docling-parser",
    status: "running",
  })
})

app.post("/parse", upload.single("file"), async (req, res) => {
  let tempDir = ""
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió archivo." })
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "docling-"))
    const inputPath = path.join(tempDir, req.file.originalname || "document.pdf")
    const outputDir = path.join(tempDir, "output")

    await fs.writeFile(inputPath, req.file.buffer)
    await fs.mkdir(outputDir, { recursive: true })

    // Ejecuta docling desde CLI
    await execFileAsync("docling", [
      inputPath,
      "--output-dir",
      outputDir,
      "--to",
      "md",
    ])

    const baseName = path.parse(inputPath).name
    const mdPath = path.join(outputDir, `${baseName}.md`)

    let markdown = ""
    try {
      markdown = await fs.readFile(mdPath, "utf8")
    } catch {
      markdown = ""
    }

    const text = cleanText(markdown)
    const pages = buildPagesFromText(text)

    return res.json({
      success: !!text,
      parser: "docling",
      method: "docling-api",
      title: baseName,
      markdown,
      text,
      pageCount: pages.length,
      pages,
      ocrUsed: false,
      metadata: {
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
      },
    })
  } catch (error) {
    console.error("[Docling Parser] error:", error)
    return res.status(500).json({
      success: false,
      parser: "docling",
      method: "docling-api",
      error: error?.message || "Error procesando documento.",
    })
  } finally {
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true })
      } catch {}
    }
  }
})

app.listen(PORT, () => {
  console.log(`Docling parser running on port ${PORT}`)
})