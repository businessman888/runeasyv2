import { PATENTS, PatentDef } from '../constants/patents';

export function getCurrentPatent(level: number): PatentDef {
    const safeLevel = Math.max(1, Math.floor(level || 1));
    return (
        PATENTS.find(p => safeLevel >= p.minLevel && safeLevel <= p.maxLevel) ?? PATENTS[0]
    );
}

export function isPatentUnlocked(patent: PatentDef, level: number): boolean {
    return (level || 1) >= patent.minLevel;
}

export function getPatentIndex(level: number): number {
    const current = getCurrentPatent(level);
    return PATENTS.findIndex(p => p.id === current.id);
}
