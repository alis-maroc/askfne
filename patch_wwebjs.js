const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'node_modules/whatsapp-web.js/src/util/Puppeteer.js');
if (fs.existsSync(target)) {
  const patched = `async function exposeFunctionIfAbsent(page, name, fn) {
    try {
        await page.exposeFunction(name, fn);
    } catch (e) {
        if (!e.message || (!e.message.includes('already exists') && !e.message.includes('already been bound'))) {
            throw e;
        }
    }
}

module.exports = { exposeFunctionIfAbsent };
`;
  fs.writeFileSync(target, patched);
  console.log('Successfully patched whatsapp-web.js Puppeteer.js');
} else {
  console.warn('Puppeteer.js not found at:', target);
}
