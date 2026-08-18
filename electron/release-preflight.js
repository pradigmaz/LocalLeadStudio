const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function directoryHashes(root) {
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Не найдена папка: ${root}`);
  }

  const hashes = new Map();
  const visit = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const absolute = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(absolute);
      if (entry.isFile()) {
        const relative = path.relative(root, absolute).split(path.sep).join('/');
        hashes.set(relative, crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'));
      }
    }
  };
  visit(root);
  return hashes;
}

function findBundledFrontend(backendDist) {
  const candidates = [
    path.join(backendDist, '_internal', 'frontend_dist'),
    path.join(backendDist, 'frontend_dist'),
  ];
  const bundledFrontend = candidates.find((candidate) => fs.statSync(candidate, { throwIfNoEntry: false })?.isDirectory());
  if (!bundledFrontend) {
    throw new Error(`Не найдена папка frontend_dist в ${backendDist} (ожидался _internal/frontend_dist или frontend_dist)`);
  }
  return bundledFrontend;
}

function compareDirectoryHashes(frontendDist, bundledDist) {
  const frontend = directoryHashes(frontendDist);
  const bundled = directoryHashes(bundledDist);
  return [...new Set([...frontend.keys(), ...bundled.keys()])]
    .filter((relative) => frontend.get(relative) !== bundled.get(relative))
    .sort();
}

function main() {
  const root = path.resolve(__dirname, '..');
  const frontendDist = path.join(root, 'frontend', 'dist');
  const bundledDist = findBundledFrontend(path.join(root, 'backend', 'dist', 'lls-backend'));
  const differentFiles = compareDirectoryHashes(frontendDist, bundledDist);
  if (differentFiles.length) {
    const preview = differentFiles.slice(0, 8).join(', ');
    throw new Error(`Фронтенд в backend-бандле не совпадает с frontend/dist: ${preview}. Сначала соберите backend после frontend.`);
  }
  console.log('release preflight ok: frontend_dist matches backend bundle');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { compareDirectoryHashes, findBundledFrontend };
