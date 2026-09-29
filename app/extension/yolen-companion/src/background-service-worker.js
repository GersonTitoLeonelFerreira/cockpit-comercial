/* Yolen Companion — Chrome Manifest V3 background entry point */

importScripts(
  'companion-environment.js',
  'capture-transport.js',
  'manychat-audio-background-transport.js',
  'manychat-safe-identity-background.js',
  'lead-enrichment.js',
  'companion-enrichment-comparison.js',
  'companion-background-privacy.js',
  'background.js',
)
