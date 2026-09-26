// Hostinger requires a source-visible entry file at deploy configuration time.
// The build command compiles the API first; this stable root entrypoint then loads it.
await import("./apps/api/dist/startup.js");
