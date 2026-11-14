// i18n/config.cue
defaultLocale: "en"
locales: ["en", "pl"]
targets: ["web"]
roots: ["locales"]
output: "generated"
outputs: {web: "../src/overlay/i18n/generated"}
scan: ["../src/overlay"]
