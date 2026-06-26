import puppeteer from "puppeteer";

const LAUNCH_OPTIONS = {
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
};

/**
 * Render HTML to a PDF buffer. Always returns a Node Buffer so Express + compression
 * send binary correctly (Uint8Array is JSON-serialized and breaks PDF viewers).
 */
export async function htmlToPdfBuffer(html, pdfOptions = {}) {
  const browser = await puppeteer.launch(LAUNCH_OPTIONS);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      ...pdfOptions,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/** Send a PDF download response with correct headers and binary body. */
export function sendPdf(res, buffer, filename) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);
  res.setHeader("Content-Length", String(buffer.length));
  return res.end(buffer);
}
