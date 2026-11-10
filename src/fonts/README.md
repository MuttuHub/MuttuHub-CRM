# Fonts

Self-hosted copies of the three Google Fonts families the app uses, loaded with `next/font/local` in
`src/app/layout.tsx`.

| File | Family | Weights (variable) | Tailwind token | Source |
|---|---|---|---|---|
| `bricolage-grotesque-latin.woff2` | Bricolage Grotesque | 200–800 | `font-display` | `fonts.gstatic.com/s/bricolagegrotesque/v9` |
| `instrument-sans-latin.woff2` | Instrument Sans | 400–700 | `font-sans` | `fonts.gstatic.com/s/instrumentsans/v4` |
| `jetbrains-mono-latin.woff2` | JetBrains Mono | 100–800 | `font-mono` | `fonts.gstatic.com/s/jetbrainsmono/v24` |

Each file is the `latin` subset that Google Fonts serves for its family (the same subset the app requested with
`next/font/google`). All three families are licensed under the SIL Open Font License 1.1, which allows bundling
and redistributing them with the app.

## Why they are not fetched from Google

`next/font/google` downloads the files during `next build`. When Google answers with extensionless
`fonts.gstatic.com/l/font?kit=…&skey=…` URLs, Turbopack in Next 16.3 fails the whole build with
«next/font/google queries have exactly one entry» (vercel/next.js#99114). With local files the build does not
depend on Google at all.

## Updating a font

Request the family's CSS from `https://fonts.googleapis.com/css2?family=<Family>:wght@<min>..<max>&display=swap`
with a desktop Chrome user agent, take the `url(...)` of the `/* latin */` block, download it over the file here,
and keep the `weight` range in `layout.tsx` equal to the CSS `font-weight` range.
