/**
 * Export a tutorial as Markdown+images (zipped), a self-contained printable
 * HTML report, or a professionally formatted PDF.
 */
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const PDFDocument = require('pdfkit');
const { toBase64DataUri } = require('./imageService');

function finalImagePath(tutorial, step) {
  return step.croppedImage || step.annotatedImage || step.rawImage;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Stream a ZIP containing tutorial.md and an images/ folder to `res`.
 */
function exportMarkdownZip(tutorial, imagesDir, res, filenameBase) {
  const steps = [...tutorial.steps].sort((a, b) => a.order - b.order);

  let md = `# ${tutorial.title}\n\n`;
  if (tutorial.description) md += `${tutorial.description}\n\n`;
  md += `_Generated with Scribe Local on ${new Date().toLocaleString()}_\n\n---\n\n`;

  const archive = archiver('zip', { zlib: { level: 9 } });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.zip"`);
  archive.pipe(res);

  steps.forEach((step, idx) => {
    const imgFile = path.basename(finalImagePath(tutorial, step));
    const imgSrcPath = path.join(imagesDir, imgFile);
    md += `## Step ${idx + 1}: ${step.title}\n\n`;
    if (step.description) md += `${step.description}\n\n`;
    md += `![Step ${idx + 1}](images/${imgFile})\n\n`;
    if (fs.existsSync(imgSrcPath)) {
      archive.file(imgSrcPath, { name: `images/${imgFile}` });
    }
  });

  archive.append(md, { name: 'tutorial.md' });
  archive.finalize();
}

/**
 * Build a self-contained (base64-embedded images), printable HTML report.
 */
async function buildHtmlReport(tutorial) {
  const steps = [...tutorial.steps].sort((a, b) => a.order - b.order);

  const stepsHtml = [];
  for (const [idx, step] of steps.entries()) {
    const imgPath = finalImagePath(tutorial, step);
    let dataUri = '';
    try {
      dataUri = await toBase64DataUri(imgPath);
    } catch {
      dataUri = '';
    }
    stepsHtml.push(`
      <section class="step">
        <div class="step-header">
          <span class="step-number">${idx + 1}</span>
          <h2>${escapeHtml(step.title)}</h2>
        </div>
        ${step.description ? `<p class="step-desc">${escapeHtml(step.description)}</p>` : ''}
        ${dataUri ? `<img class="step-img" src="${dataUri}" alt="Step ${idx + 1} screenshot" />` : ''}
      </section>`);
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(tutorial.title)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 860px; margin: 0 auto; padding: 40px 24px 80px; color: #111827; background: #ffffff; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  .subtitle { color: #6b7280; margin-bottom: 8px; }
  .meta { color: #9ca3af; font-size: 13px; margin-bottom: 32px; }
  .step { margin-bottom: 40px; page-break-inside: avoid; }
  .step-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .step-number { flex-shrink: 0; width: 32px; height: 32px; border-radius: 9999px; background: #111827; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
  .step-header h2 { font-size: 18px; margin: 0; }
  .step-desc { color: #374151; margin: 0 0 14px 44px; line-height: 1.5; }
  .step-img { display: block; width: 100%; border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  @media print {
    body { padding: 0 8mm; }
    .step { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>${escapeHtml(tutorial.title)}</h1>
  ${tutorial.description ? `<p class="subtitle">${escapeHtml(tutorial.description)}</p>` : ''}
  <p class="meta">Generated with Scribe Local &middot; ${new Date().toLocaleString()} &middot; ${steps.length} steps</p>
  ${stepsHtml.join('\n')}
</body>
</html>`;
}

/**
 * Stream a professionally formatted PDF report to `res`.
 */
async function exportPdf(tutorial, res, filenameBase) {
  const steps = [...tutorial.steps].sort((a, b) => a.order - b.order);
  const doc = new PDFDocument({ margin: 50, size: 'LETTER', bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.pdf"`);
  doc.pipe(res);

  doc.fontSize(24).fillColor('#111827').font('Helvetica-Bold').text(tutorial.title, { align: 'left' });
  if (tutorial.description) {
    doc.moveDown(0.3);
    doc.fontSize(12).fillColor('#4b5563').font('Helvetica').text(tutorial.description);
  }
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#9ca3af').text(
    `Generated with Scribe Local · ${new Date().toLocaleString()} · ${steps.length} steps`
  );
  doc.moveDown(1);
  doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#e5e7eb').stroke();
  doc.moveDown(1);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  for (const [idx, step] of steps.entries()) {
    const spaceNeeded = 220;
    if (doc.y + spaceNeeded > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }

    const badgeY = doc.y;
    doc.circle(doc.x + 10, badgeY + 10, 10).fill('#111827');
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text(String(idx + 1), doc.x, badgeY + 5, {
      width: 20, align: 'center'
    });

    doc.fillColor('#111827').fontSize(14).font('Helvetica-Bold').text(step.title, doc.x + 28, badgeY, {
      width: pageWidth - 28
    });

    doc.moveDown(0.2);
    if (step.description) {
      doc.fillColor('#374151').fontSize(11).font('Helvetica').text(step.description, doc.x + 28, doc.y, {
        width: pageWidth - 28
      });
    }

    doc.moveDown(0.5);

    const imgPath = finalImagePath(tutorial, step);
    if (fs.existsSync(imgPath)) {
      try {
        const imgWidth = pageWidth - 28;
        doc.image(imgPath, doc.x + 28, doc.y, { fit: [imgWidth, 320], align: 'left' });
        doc.moveDown(0.5);
        const imgDims = doc.openImage(imgPath);
        const scaledHeight = Math.min(320, (imgDims.height / imgDims.width) * imgWidth);
        doc.y = doc.y + scaledHeight + 10;
      } catch {
        // skip image if unreadable
      }
    }

    doc.moveDown(1);
  }

  // Footer page numbers
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor('#9ca3af').text(
      `${i + 1} / ${range.count}`,
      0,
      doc.page.height - 30,
      { align: 'center' }
    );
  }

  doc.end();
}

module.exports = { exportMarkdownZip, buildHtmlReport, exportPdf };
