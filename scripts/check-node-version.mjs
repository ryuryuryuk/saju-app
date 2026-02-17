const major = Number.parseInt(process.versions.node.split('.')[0], 10);

if (!Number.isFinite(major)) {
  console.error('Unable to detect Node.js version.');
  process.exit(1);
}

if (major >= 24) {
  console.error('\n[dev blocked] Node.js v24 is unstable with this Next.js dev setup.');
  console.error('Use Node.js 22 LTS, then run the dev server again.');
  console.error('Suggested: `nvm use 22` (or `nvm install 22 && nvm use 22`)\n');
  process.exit(1);
}
