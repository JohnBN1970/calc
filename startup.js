// Hostinger/LiteSpeed loads the configured entrypoint through CommonJS require().
// Keep this root file CommonJS-compatible and start the ESM application asynchronously.
void import("./apps/api/dist/startup.js").catch((error) => {
  console.error("BREBO Calc startup failed.", error);
  process.exitCode = 1;
});
