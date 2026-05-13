const PDFSHIFT_URL = "https://api.pdfshift.io/v3/convert/pdf";

async function convertToPdf({ url, apiKey }) {
  const auth = "Basic " + Buffer.from(`api:${apiKey}`).toString("base64");
  const res = await fetch(PDFSHIFT_URL, {
    method: "POST",
    headers: {
      "Authorization": auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: url,
      sandbox: false,
      format: "Letter",
      margin: "18mm",
      use_print: true,
      delay: 2000,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PDFShift ${res.status}: ${body}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function archivePdf(store, id, pdfBuffer) {
  await store.set(`${id}.pdf`, pdfBuffer);
}

async function getPdf(store, id) {
  const raw = await store.get(`${id}.pdf`, { type: "arrayBuffer" });
  if (!raw) return null;
  return Buffer.from(raw);
}

module.exports = { convertToPdf, archivePdf, getPdf };
