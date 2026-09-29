# City concept image provenance

Generated with the built-in `image_gen` tool on 2026-09-29. These are illustrative concept images, not user check-in photographs and not documentary records of the locations. They must never be prefilled as the user's uploaded photos.

Both landscape PNG assets were visually inspected after copying into the project. Original generated files remain in the Codex generated images directory.

## Nanjing

- Final asset: `public/images/nanjing.png`
- Original: `C:/Users/A/.codex/generated_images/01a0eca3-5cf0-7663-953e-c13e159eb753/exec-ca3acde1-c136-42e3-8c37-7d7dc04933b8.png`

```text
Use case: photorealistic-natural
Asset type: editorial city discovery card illustration for a Chinese mobile travel exploration MVP.
Primary request: a cinematic, realistic landscape photo inspired by Nanjing Jiming Temple (鸡鸣寺), a golden ochre Chinese pagoda framed by lush green trees in the late afternoon.
Scene/backdrop: temple architecture surrounded by dense leafy green trees, subtle city background receding softly; no foreground people.
Subject: graceful traditional multi-storey pagoda visible above tree canopy with authentic curved Chinese eaves, golden warm walls, dark roof tiles.
Style/medium: refined travel editorial photography with natural texture, quiet contemplative mood.
Composition/framing: horizontal landscape around 3:2, pagoda slightly right of center, leafy framing foreground, crop-safe focal point for a compact rounded mobile card.
Lighting/mood: soft late-afternoon golden sunlight, gentle atmospheric depth, realistic greens and warm sandstone-gold.
Constraints: standalone photo; no UI, no border, no captions, no readable text, no watermark, no invented signs.
Avoid: oversaturated postcard treatment, crowds, fantasy temple architecture.
```

## Xi'an

- Final asset: `public/images/xian.png`
- Original: `C:/Users/A/.codex/generated_images/01a0eca3-5cf0-7663-953e-c13e159eb753/exec-07c61122-a9f3-4791-b9cb-7c84b8d0b708.png`

```text
Use case: photorealistic-natural
Asset type: editorial city discovery card illustration for a Chinese mobile travel exploration MVP.
Primary request: a cinematic, realistic landscape photograph inspired by Xi'an Bell Tower (西安钟楼) at sunset, its traditional layered roofs lit warmly in amber.
Scene/backdrop: the historic Bell Tower standing clearly in a broad urban square, quiet city distance kept soft and minimal.
Subject: authentic Chinese double-eave tiled roofs on the Xi'an Bell Tower, deep green glazed tiles, red wooden columns, warm golden lighting, stone base visible.
Style/medium: refined travel editorial photography, naturally detailed architecture and calm evening atmosphere.
Composition/framing: horizontal landscape around 3:2, tower centered, crop-safe focal point for a compact rounded mobile card.
Lighting/mood: warm amber sunset and softly illuminated roof edges, pale warm sky, realistic shadows.
Constraints: standalone photo; no UI, no border, no captions, no readable text, no watermark, no invented signs.
Avoid: oversaturated postcard treatment, crowds, fantasy architecture.
```
## 地图材质（2026-09-30）

两张生产纹理由内置 Image Gen 生成，再做 WebP 编码，保持原始像素尺寸。纸感约 50 KB、藏宝图约 92 KB，纹理本身没有任何道路、文字或地理内容。运行时仅绘制在未解锁主题层，已解锁区将纹理与其他主题像素一起清除。

- `public/images/map-paper-texture.webp`：浅纸感。
- `public/images/map-treasure-texture.webp`：暖旧纸感。

纸感生成提示词：

> Use case: stylized-concept. Asset type: seamless tileable background texture for an actual mobile map canvas, not a map or mockup. Generate a 1024x1024 square flat scanned sheet of very pale fine ivory drawing paper, color target #f4f1e9. Paper grain delicate microscopic cellulose fibers and tiny natural mottling, elegant C paper travel-map look. Entire image uniform front-on plane, soft diffuse even lighting, no shadows, no edges or vignette, no marks/roads/letters/objects. No creases or stains. Seamless tiling edges so repetition is inconspicuous. Texture must remain faint and calm under live vector road names and outlines; high readability, warm offwhite almost white, not mustard or brown, not canvas weave. This is a standalone production background asset; all geography and UI text will be drawn separately in code.

藏宝图生成提示词：

> Use case: stylized-concept. Asset type: seamless tileable paper texture ONLY for optional treasure-map background in a modern mobile exploration app. Generate 1024x1024 square flat scanned pale parchment sheet, color target #f2e6cc, warmly aged ivory with delicate sepia paper fibers, very subtle mottling and a faint fold crease near one third of canvas. Strong enough to evoke a treasured travel map but calm under live road labels. Even diffuse front-on flat lighting, seamless edges, no vignette or dark burnt perimeter, no frame, no objects, no text, no map drawings, no roads, no illustrations, no compass, no stains obscuring readability, no yellow saturation or distressed grunge. Entire output a production background material asset; vector geography and UI text will be drawn separately. Soft fine texture reminiscent of a well preserved paper map, lightly warmer than regular ivory drawing paper, natural texture scale at phone screen size.
