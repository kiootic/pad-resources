pad-visual-media
=============
P&D card image renderer

Requirement
-----------
- Node 8 & Yarn

Usage
-----
```sh
yarn update  # download image data from server
yarn extract data/HT/bin/mons_4428.bin --out data/HT/spine
yarn render data/HT/spine/mons_4428.json data/HT/out
```

Rendering
---------
For simple cards, `yarn extract` output a simple PNG. For animated cards,
`yarn extract` outputs Spine data JSON and atlas data. You can render them
using any Spine-compatible renderer.

As an example, a web renderer is provided at `/renderer` directory of the repo.
Note that usage of the web player is subjected to respective licenses of Spine
runtime.

License
-------
MIT
