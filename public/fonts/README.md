# Fonts

Download **Noto Sans Bengali** (and Noto Sans for Latin, if you want a matching look)
from Google Fonts and place the files here:

```
public/fonts/NotoSansBengali-Regular.woff2
public/fonts/NotoSansBengali-Bold.woff2
```

Source: https://fonts.google.com/noto/specimen/Noto+Sans+Bengali

These aren't checked into this scaffold to keep the repo small — `style.css`
already has the `@font-face` rule pointing at `NotoSansBengali-Regular.woff2`.

This font is also required for the canvas renderer (Phase 3) so subtitle
glyphs render correctly — see CLAUDE.md §11.

Both weights are needed: subtitles render at weight 700. Both fonts are licensed under the SIL Open Font License.
