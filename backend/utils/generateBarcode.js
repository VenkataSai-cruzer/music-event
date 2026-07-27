const bwipjs = require('bwip-js');

/**
 * Generates a Code128 barcode SVG data URI from the given text.
 * Used inline inside the SVG ticket template via {{BARCODE_IMAGE}}.
 * @param {string} text - The text to encode (e.g., ticket ID).
 * @returns {Promise<string>} - An SVG data URI string.
 */
async function generateBarcode(text) {
  const svgStr = await bwipjs.toSVG({
    bcid: 'code128',
    text: String(text),
    scaleX: 1.5,
    scaleY: 1,
    height: 35,
    includetext: false,
    backgroundcolor: 'FFFFFF',
    barcolor: '000000',
    paddingwidth: 0,
    paddingheight: 0,
  });

  const base64 = Buffer.from(svgStr).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

module.exports = generateBarcode;
