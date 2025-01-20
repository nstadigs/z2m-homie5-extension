# Homie v5 zigbee2mqtt extension

## Status (early dev)

Devices, nodes and properties are being published at startup.
Values are also being published at startup, but there's no formatting yet.
Nothing else works ;)

## Deploy

Currently there's a cli to publish the extension to your zigbee2mqtt environment
via mqtt.

```
pnpm install
pnpm run build
cd dist
node ./cli.js --help
```

## Future

When everything works and homie v5 is stable I will create a PR to get this into
the zigbee2mqtt codebase as a built-in extension, just like the homeassistant extension
