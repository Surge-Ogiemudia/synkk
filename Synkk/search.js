const fs = require('fs');
const path = require('path');

function search(dir) {
  if (dir.includes('node_modules') || dir.includes('.next') || dir.includes('.git') || dir.includes('dist')) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      search(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.toLowerCase().includes('pusher')) {
        console.log("=== " + fullPath + " ===");
        const lines = content.split('\n');
        lines.forEach((l, i) => { if (l.toLowerCase().includes('pusher')) console.log((i+1) + ': ' + l.trim()); });
      }
    }
  }
}
search('c:\\Users\\HP\\Desktop\\zipped pharmastackx');
