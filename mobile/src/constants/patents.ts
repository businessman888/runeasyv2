/**
 * Patent definitions — 10 ranks tied to level ranges.
 * Gradient stops mirror the radial-gradient structure from Figma
 * (node 1094:1333), with one stop per quadrant: inner highlight,
 * mid tone, outer band, outer rim.
 */

export interface PatentDef {
    id: string;
    name: string;
    minLevel: number;
    maxLevel: number; // inclusive; Infinity for the last tier
    /** Four radial-gradient stops: 0%, 50%, 75%, 100% */
    gradient: [string, string, string, string];
    /** Outer glow color (used for shadow + halo) */
    glow: string;
    /** Shorter caption for chips */
    shortName: string;
}

export const PATENTS: PatentDef[] = [
    {
        id: 'patent-1',
        name: 'Iniciante',
        shortName: 'Iniciante',
        minLevel: 1,
        maxLevel: 2,
        gradient: ['#89898F', '#58585C', '#797989', '#B1B1B7'], // Figma: silver
        glow: '#A0A0A8',
    },
    {
        id: 'patent-2',
        name: 'Aprendiz',
        shortName: 'Aprendiz',
        minLevel: 3,
        maxLevel: 5,
        gradient: ['#C9A57A', '#8B6F4E', '#A88554', '#5C4226'], // bronze
        glow: '#C9A57A',
    },
    {
        id: 'patent-3',
        name: 'Corredor',
        shortName: 'Corredor',
        minLevel: 6,
        maxLevel: 9,
        gradient: ['#FFE066', '#D4A017', '#FFD700', '#7A5C00'], // gold
        glow: '#FFD700',
    },
    {
        id: 'patent-4',
        name: 'Corredor Nato',
        shortName: 'Nato',
        minLevel: 10,
        maxLevel: 14,
        gradient: ['#9747FF', '#7939CC', '#826AF9', '#3C3C85'], // Figma: purple
        glow: '#9747FF',
    },
    {
        id: 'patent-5',
        name: 'Atleta',
        shortName: 'Atleta',
        minLevel: 15,
        maxLevel: 20,
        gradient: ['#4289C1', '#357BAA', '#33CFFF', '#2052CB'], // Figma: blue/cyan
        glow: '#33CFFF',
    },
    {
        id: 'patent-6',
        name: 'Veterano',
        shortName: 'Veterano',
        minLevel: 21,
        maxLevel: 27,
        gradient: ['#10E0A0', '#0A8C66', '#00FF88', '#0A4D38'], // emerald
        glow: '#00FF88',
    },
    {
        id: 'patent-7',
        name: 'Mestre',
        shortName: 'Mestre',
        minLevel: 28,
        maxLevel: 34,
        gradient: ['#FF7A33', '#C84A0F', '#FF6B35', '#5C2308'], // orange
        glow: '#FF6B35',
    },
    {
        id: 'patent-8',
        name: 'Elite',
        shortName: 'Elite',
        minLevel: 35,
        maxLevel: 41,
        gradient: ['#FF5070', '#C71F3F', '#FF1744', '#5C0817'], // crimson
        glow: '#FF1744',
    },
    {
        id: 'patent-9',
        name: 'Lendário',
        shortName: 'Lendário',
        minLevel: 42,
        maxLevel: 49,
        gradient: ['#FFFFFF', '#C0C0D0', '#E8E8F2', '#6B6B85'], // platinum
        glow: '#FFFFFF',
    },
    {
        id: 'patent-10',
        name: 'Mítico',
        shortName: 'Mítico',
        minLevel: 50,
        maxLevel: Number.POSITIVE_INFINITY,
        gradient: ['#00FFD1', '#9747FF', '#FF1493', '#5C0040'], // iridescent
        glow: '#FF1493',
    },
];
