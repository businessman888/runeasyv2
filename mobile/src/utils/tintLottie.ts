/**
 * Recolors a Lottie animation to a theme token.
 *
 * Why not `colorFilters`: that prop matches layers by keypath, and our
 * `moon.json` carries the same fill across five layers — four of them named
 * `star`. Keypath matching on duplicate names behaves differently between the
 * iOS and Android Lottie runtimes, so the icon would silently come out
 * half-recolored on one platform. Rewriting the fills in the document is
 * deterministic and follows a theme change like any other token.
 *
 * The rewrite only touches solid fills (`ty: 'fl'`) and strokes (`ty: 'st'`)
 * with a static color, which is what an icon-style animation uses. Animated
 * color keyframes and gradient fills are left alone — recoloring those would
 * need per-keyframe handling and no asset here uses them.
 */

type LottieJson = Record<string, unknown>;

/** Normalized RGB triple in Lottie's 0–1 space. */
function parseColor(color: string): [number, number, number] | null {
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(color);
    if (hex) {
        return [
            parseInt(hex[1], 16) / 255,
            parseInt(hex[2], 16) / 255,
            parseInt(hex[3], 16) / 255,
        ];
    }

    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
    if (short) {
        return [
            parseInt(short[1] + short[1], 16) / 255,
            parseInt(short[2] + short[2], 16) / 255,
            parseInt(short[3] + short[3], 16) / 255,
        ];
    }

    const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(color);
    if (fn) {
        return [Number(fn[1]) / 255, Number(fn[2]) / 255, Number(fn[3]) / 255];
    }

    return null;
}

function isStaticColorProp(value: unknown): value is { a: number; k: number[] } {
    if (typeof value !== 'object' || value === null) return false;
    const prop = value as { a?: unknown; k?: unknown };
    return prop.a === 0 && Array.isArray(prop.k) && prop.k.length >= 3;
}

function walk(node: unknown, rgb: [number, number, number]): unknown {
    if (Array.isArray(node)) {
        return node.map((child) => walk(child, rgb));
    }

    if (typeof node !== 'object' || node === null) {
        return node;
    }

    const source = node as LottieJson;
    const next: LottieJson = {};

    for (const key of Object.keys(source)) {
        next[key] = walk(source[key], rgb);
    }

    const type = source.ty;
    if ((type === 'fl' || type === 'st') && isStaticColorProp(source.c)) {
        const original = (source.c as { k: number[] }).k;
        next.c = {
            ...(source.c as object),
            // Preserve a 4th component (alpha) if the asset carries one.
            k: original.length > 3 ? [...rgb, original[3]] : [...rgb],
        };
    }

    return next;
}

/**
 * Returns a copy of `source` with every static fill/stroke set to `color`.
 *
 * Call this inside a `useMemo` keyed on the color — it deep-clones the
 * document, so it should not run on every render.
 */
export function tintLottieColors<T>(source: T, color: string): T {
    const rgb = parseColor(color);
    if (!rgb) return source;

    return walk(source, rgb) as T;
}
