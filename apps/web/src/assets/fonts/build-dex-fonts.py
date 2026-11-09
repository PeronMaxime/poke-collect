"""Polices pixel du jeu (Dex Digits, Dex Pixel), dérivées de Press Start 2P (licence OFL).

- Garde les chiffres de Press Start 2P, dont le 2 et le 5 se lisent mieux que ceux de Pixelify Sans.
- Redessine le 6, dont le haut restait ouvert, avec un crochet qui redescend.
- Ajoute l'espace fine des milliers (U+202F), absente de l'originale.
- Police des titres seulement : majuscules accentuées (É, À, Ç…) à pleine hauteur, accent
  au-dessus. Press Start 2P tasse la lettre sur 5 rangées pour loger l'accent dans sa grille, ce
  qui la fait paraître minuscule à côté des autres capitales.
- Sans hinting : celui de l'originale arrondit ses lettres au pixel, pas les glyphes redessinés,
  qui paraissaient alors décalés d'un pixel (É, 6) aux tailles qui ne sont pas des multiples de 8.
- Renomme la police : l'OFL interdit de garder le nom réservé « Press Start 2P » sur une version
  modifiée.

Deux fichiers :
- dex-digits.woff2, chiffres du texte (Pixelify Sans) : descendus d'une rangée de pixels pour
  poser sur la ligne de base comme les lettres (Press Start 2P laisse une rangée vide dessous).
- dex-pixel.woff2, police complète des titres, à la place de Press Start 2P : tous ses caractères,
  chiffres à leur place d'origine.

Usage (depuis apps/web) :
  python -I src/assets/fonts/build-dex-fonts.py \
    node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2 \
    src/assets/fonts
Nécessite fonttools et brotli (pip install fonttools brotli).
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.pointInsidePen import PointInsidePen

# Grille de la police : 8 × 8 pixels de 125 unités ; les chiffres occupent les rangées 1 à 7.
PIXEL = 125
# Recouvrement entre deux lignes de pixels, pour qu'aucun liseré n'apparaisse à l'écran.
OVERLAP = 4

SIX = [
    '.#####..',
    '##...##.',
    '##......',
    '######..',
    '##...##.',
    '##...##.',
    '.#####..',
]


# Majuscule accentuée : lettre de base, minuscule dont on reprend l'accent.
ACCENTED = {
    'À': ('A', 'à'), 'Â': ('A', 'â'), 'Ä': ('A', 'ä'),
    'É': ('E', 'é'), 'È': ('E', 'è'), 'Ê': ('E', 'ê'), 'Ë': ('E', 'ë'),
    'Î': ('I', 'î'), 'Ï': ('I', 'ï'),
    'Ô': ('O', 'ô'), 'Ö': ('O', 'ö'),
    'Ù': ('U', 'ù'), 'Û': ('U', 'û'), 'Ü': ('U', 'ü'),
    'Ÿ': ('Y', 'ÿ'),
}


def raster(font, char, rows):
    """Pixels d'un caractère de Press Start 2P, rangée par rangée (y du haut vers le bas)."""
    glyphs = font.getGlyphSet()
    name = font.getBestCmap()[ord(char)]
    out = []
    for y in rows:
        line = ''
        for x in range(8):
            pen = PointInsidePen(glyphs, ((x + 0.5) * PIXEL, (y + 0.5) * PIXEL))
            glyphs[name].draw(pen)
            line += '#' if pen.getResult() else '.'
        out.append(line)
    return out


def accented_rows(font, char):
    """Majuscule accentuée : lettre sur ses 7 rangées, accent sur les 2 du dessus (ou cédille)."""
    if char == 'Ç':
        # C entier, cédille d'une rangée sous la ligne de base.
        return raster(font, 'C', range(7, 0, -1)) + raster(font, 'Ç', [1]), 7
    base, lower = ACCENTED[char]
    # Accent de la minuscule (rangées 7 et 6), remonté au-dessus de la capitale (9 et 8).
    return raster(font, lower, [7, 6]) + raster(font, base, range(7, 0, -1)), 9


def pixel_glyph(rows, top=None):
    """Contours d'un glyphe dessiné en pixels (lignes du haut vers le bas ; `top` = rangée de la
    première ligne, 7 par défaut pour un glyphe de 7 lignes)."""
    pen = TTGlyphPen(None)
    top = len(rows) if top is None else top
    for i, row in enumerate(rows):
        y0 = (top - i) * PIXEL
        y1 = y0 + PIXEL
        below = rows[i + 1] if i + 1 < len(rows) else '.' * len(row)
        x = 0
        while x < len(row):
            if row[x] != '#':
                x += 1
                continue
            start = x
            while x < len(row) and row[x] == '#':
                x += 1
            touches = any(below[k] == '#' for k in range(start, x))
            bottom = y0 - OVERLAP if touches else y0
            x0, x1 = start * PIXEL, x * PIXEL
            # Sens horaire : contour plein en TrueType.
            pen.moveTo((x0, bottom))
            pen.lineTo((x0, y1))
            pen.lineTo((x1, y1))
            pen.lineTo((x1, bottom))
            pen.closePath()
    return pen.glyph()


def build(src, dst, family, postscript, shift, accents, full=False):
    """Police dérivée : chiffres (6 redessiné) décalés de `shift` vers le bas, espace fine,
    majuscules accentuées si `accents`, tous les caractères de l'originale si `full`, nom changé."""
    original = TTFont(src)
    font = TTFont(src)
    extra = [ord(c) for c in [*ACCENTED, 'Ç']] if accents else []
    opts = Options()
    opts.flavor = 'woff2'
    opts.layout_features = []
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    # Sans hinting : ses instructions recaleraient les chiffres décalés à leur place d'origine.
    opts.hinting = False
    sub = Subsetter(opts)
    keep = set(original.getBestCmap()) if full else {0x20, *range(0x30, 0x3A)}
    sub.populate(unicodes=sorted(keep | set(extra)))
    sub.subset(font)

    cmap = font.getBestCmap()
    glyf = font['glyf']
    hmtx = font['hmtx']

    six = cmap[ord('6')]
    glyf[six] = pixel_glyph(SIX)

    for ch in '0123456789':
        name = cmap[ord(ch)]
        glyph = glyf[name]
        assert not glyph.isComposite(), ch
        if shift:
            glyph.coordinates.translate((0, -shift))
        glyph.recalcBounds(glyf)
        hmtx[name] = (hmtx[name][0], glyph.xMin)

    for code in extra:
        name = cmap.get(code)
        if name is None:  # Ÿ : absent de l'originale, nouveau glyphe
            name = 'uni%04X' % code
        rows, top = accented_rows(original, chr(code))
        glyf[name] = pixel_glyph(rows, top)
        glyf[name].recalcBounds(glyf)
        hmtx[name] = (1000, glyf[name].xMin)
        if name not in font.getGlyphOrder():
            order = font.getGlyphOrder() + [name]
            font.setGlyphOrder(order)
            glyf.glyphOrder = order
            font['maxp'].numGlyphs = len(order)
        for table in font['cmap'].tables:
            if table.isUnicode():
                table.cmap[code] = name

    # Espace fine : glyphe vide, large d'une demi-chasse (les chiffres font toute la chasse).
    advance = hmtx[cmap[0x20]][0]
    thin = 'uni202F'
    glyf[thin] = TTGlyphPen(None).glyph()
    hmtx[thin] = (advance // 2, 0)
    order = [g for g in font.getGlyphOrder() if g != thin] + [thin]
    font.setGlyphOrder(order)
    glyf.glyphOrder = order
    font['maxp'].numGlyphs = len(order)
    for table in font['cmap'].tables:
        if table.isUnicode():
            table.cmap[0x202F] = thin

    for rec in font['name'].names:
        if rec.nameID in (1, 16):
            rec.string = family
        elif rec.nameID == 4:
            rec.string = family + ' Regular'
        elif rec.nameID == 6:
            rec.string = postscript + '-Regular'
        elif rec.nameID == 3:
            rec.string = '1.0;' + postscript + '-Regular'
    assert not any(
        'Press Start 2P' in r.toUnicode()
        for r in font['name'].names
        if r.nameID in (1, 3, 4, 6, 16)
    )
    font.flavor = 'woff2'
    font.save(dst)
    print('ok', dst)


src, out = sys.argv[1], sys.argv[2]
build(src, f'{out}/dex-digits.woff2', 'Dex Digits', 'DexDigits', PIXEL, accents=False)
build(src, f'{out}/dex-pixel.woff2', 'Dex Pixel', 'DexPixel', 0, accents=True, full=True)
