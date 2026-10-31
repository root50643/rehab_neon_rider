# Sources and notices

## Rehab ESP32 WebBLE codec

`src/vendor/protocol.js` is derived from `web/protocol.js` in
[root50643/rehab_esp32_webble](https://github.com/root50643/rehab_esp32_webble),
at commit `93e8fb5baabb0682fb5a3280de51fc02a2ac4a82`.

Only the UMD wrapper was replaced with ES module exports; fragmentation,
UUIDs, bounds, command encoding and UTF-8 handling are unchanged.
The accompanying TypeScript declarations were added for this project.
There is no runtime request to the upstream repository.

The upstream repository does not include a reuse license. This project was
created for the repository owner's requested integration; public visibility
alone does not grant third parties a reuse license. No new blanket license
is asserted for this project.

## Dependencies and artwork

Three.js is distributed under the MIT license; its license is retained in
the installed package and bundled code. Build and test dependencies retain
their respective licenses in their packages and lockfile.

All scene geometry, shaders, interface graphics and synthesized sound effects
were authored for this game. No external models, fonts, music, image services
or runtime CDNs are required.
