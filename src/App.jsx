import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Users, Settings, Trophy, Clock, Play, ChevronRight, Grid, Dices, Edit2, Check, Download, Upload, Plus, Trash2, X, Monitor, LogIn, Lock, Cloud, Inbox, ArrowRight } from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA_jvqZQT8dR39ofvCn63j_v66z4VjhmoY",
  authDomain: "vereinsmeisterschaft2026.firebaseapp.com",
  projectId: "vereinsmeisterschaft2026",
  storageBucket: "vereinsmeisterschaft2026.firebasestorage.app",
  messagingSenderId: "729427412928",
  appId: "1:729427412928:web:3147486e27718bcbc36a25"
};

// Initialize Firebase safely (prevents hot-reload crashes causing white screens)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'tc-wannweil-2026';

const DEFAULT_CATEGORIES = [
    "Kids-Einzel",
    "Damen-Einzel",
    "Herren-Einzel U60",
    "Herren-Einzel Ü60",
    "Damen-Doppel",
    "Herren-Doppel U60",
    "Herren-Doppel Ü60",
    "Mixed"
];

const FIRST_NAMES_M = ["Lukas", "Maximilian", "Tim", "Paul", "Leon", "Jonas", "Finn", "Elias", "Luis", "Julian", "Tom", "Felix"];
const FIRST_NAMES_F = ["Mia", "Emma", "Hannah", "Sofia", "Anna", "Lea", "Emilia", "Marie", "Lena", "Amelie", "Laura", "Sarah"];
const LAST_NAMES = ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann", "Schäfer", "Koch", "Bauer", "Richter", "Klein", "Wolf"];

const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

const extractPlayers = (participantString) => {
  if (!participantString || participantString === 'Freilos' || participantString.includes('Gruppe') || participantString.includes('Sieger') || participantString.includes('Platz')) return [];
  return participantString.split(/\s*\/\s*|\s*&\s*|\s*und\s*/i).map(p => p.trim());
};

const getKnockoutSeeds = (size) => {
    if(size <= 1) return [0];
    let seeds = [0, 1];
    while (seeds.length < size) {
        const currentSize = seeds.length;
        const nextSeeds = [];
        for (let i = 0; i < currentSize; i++) {
            nextSeeds.push(seeds[i]);
            nextSeeds.push(currentSize * 2 - 1 - seeds[i]);
        }
        seeds = nextSeeds;
    }
    return seeds;
};

const getRoundName = (rs) => rs === 4 ? 'VF' : (rs === 2 ? 'HF' : (rs === 8 ? 'AF' : `R${rs*2}`));

const calculateStandings = (groupName, structure, catMatches) => {
    const groupMatches = catMatches.filter(m => m.stage === 'group' && m.groupName === groupName);
    const players = structure.groups[groupName].map(name => ({ name, wins: 0, gamesWon: 0, gamesLost: 0, diff: 0, matches: 0 }));
    
    groupMatches.forEach(m => {
        if (m.winner) {
            let s1 = 0, s2 = 0;
            if (m.score && m.score !== 'Freilos') {
                const matchResult = m.score.match(/^(\d+)\s*:\s*(\d+)$/);
                if (matchResult) {
                    s1 = parseInt(matchResult[1], 10);
                    s2 = parseInt(matchResult[2], 10);
                }
            }
            const p1 = players.find(p => p.name === m.player1);
            const p2 = players.find(p => p.name === m.player2);
            
            if (p1) {
                p1.matches += 1;
                p1.gamesWon += s1;
                p1.gamesLost += s2;
                p1.diff = p1.gamesWon - p1.gamesLost;
                if (m.winner === p1.name) p1.wins += 1;
            }
            if (p2 && p1 !== p2) {
                p2.matches += 1;
                p2.gamesWon += s2;
                p2.gamesLost += s1;
                p2.diff = p2.gamesWon - p2.gamesLost;
                if (m.winner === p2.name) p2.wins += 1;
            }
        }
    });
    
    return players.sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.diff !== a.diff) return b.diff - a.diff;
        return b.gamesWon - a.gamesWon;
    });
};

const processTournamentProgressPure = (currentMatches, structures, activeCategories) => {
    let updated = JSON.parse(JSON.stringify(currentMatches));

    activeCategories.forEach(cat => {
        const structure = structures[cat];
        if (!structure) return;

        const catMatches = Object.values(updated).filter(m => m.category === cat);
        const groupMatches = catMatches.filter(m => m.stage === 'group');
        
        const groupsDone = groupMatches.length > 0 && groupMatches.every(m => m.winner);
        
        const standings = {};
        if (structure.groups) {
            Object.keys(structure.groups).forEach(gName => {
                standings[gName] = calculateStandings(gName, structure, catMatches);
            });
        }

        if (groupsDone) {
            catMatches.forEach(m => {
                if (m.stage === 'ko' || m.stage === 'final') {
                    let updatedConflict = false;
                    ['player1', 'player2'].forEach(pKey => {
                        const origKey = pKey === 'player1' ? 'originalPlayer1' : 'originalPlayer2';
                        const pVal = m[origKey];
                        if (pVal) {
                            const matchRegex = pVal.match(/^(\d+)\.\s+(Gruppe\s+[A-Z0-9]+)$/);
                            if (matchRegex) {
                                const rank = parseInt(matchRegex[1], 10) - 1;
                                const gName = matchRegex[2];
                                if (standings[gName] && standings[gName][rank]) {
                                    if (m[pKey] !== standings[gName][rank].name) {
                                        m[pKey] = standings[gName][rank].name;
                                        m.winner = null;
                                        m.score = '';
                                        updatedConflict = true;
                                    }
                                }
                            }
                        }
                    });
                    if (updatedConflict && m.score !== 'Freilos') {
                        m.conflictPlayers = [...extractPlayers(m.player1), ...extractPlayers(m.player2)];
                    }
                }
            });
        } else {
            catMatches.forEach(m => {
                if (m.stage === 'ko' || m.stage === 'final') {
                    let reset = false;
                    ['player1', 'player2'].forEach(pKey => {
                        const origKey = pKey === 'player1' ? 'originalPlayer1' : 'originalPlayer2';
                        const origVal = m[origKey];
                        if (origVal && origVal.match(/^(\d+)\.\s+(Gruppe\s+[A-Z0-9]+)$/) && m[pKey] !== origVal) {
                            m[pKey] = origVal;
                            m.winner = null;
                            m.score = '';
                            reset = true;
                        }
                    });
                    if (reset && m.score !== 'Freilos') {
                        m.conflictPlayers = [...extractPlayers(m.player1), ...extractPlayers(m.player2)];
                    }
                }
            });
        }

        const allKoMatches = catMatches.filter(m => m.stage === 'ko' || (m.stage === 'final' && m.koRound === 1));
        const koRounds = [...new Set(allKoMatches.map(m => m.koRound))].sort((a,b) => b-a); 
        
        koRounds.forEach(r => {
            const matchesInRound = allKoMatches.filter(m => m.koRound === r);
            matchesInRound.forEach(m => {
                if (r > 1) { 
                    const nextRound = r / 2;
                    const nextMatchIndex = Math.floor(m.matchIndex / 2);
                    const nextMatch = allKoMatches.find(x => x.koRound === nextRound && x.matchIndex === nextMatchIndex);
                    
                    if (nextMatch) {
                        const pKey = m.matchIndex % 2 === 0 ? 'player1' : 'player2';
                        const origKey = m.matchIndex % 2 === 0 ? 'originalPlayer1' : 'originalPlayer2';
                        
                        if (m.winner && m.score !== 'Freilos') {
                            if (nextMatch[pKey] !== m.winner) {
                                nextMatch[pKey] = m.winner;
                                nextMatch.winner = null;
                                nextMatch.score = nextMatch.score === 'Freilos' ? '' : nextMatch.score;
                                if(nextMatch.originalPlayer1 !== 'Freilos' && nextMatch.originalPlayer2 !== 'Freilos') {
                                    nextMatch.conflictPlayers = [...extractPlayers(nextMatch.player1), ...extractPlayers(nextMatch.player2)];
                                }
                            }
                        } else if (m.winner && m.score === 'Freilos') {
                            if (nextMatch[pKey] !== m.winner) {
                                nextMatch[pKey] = m.winner;
                            }
                        } else {
                            if (nextMatch[origKey] && nextMatch[pKey] !== nextMatch[origKey]) {
                                nextMatch[pKey] = nextMatch[origKey];
                                nextMatch.winner = null;
                                nextMatch.score = '';
                                nextMatch.conflictPlayers = [...extractPlayers(nextMatch.player1), ...extractPlayers(nextMatch.player2)];
                            }
                        }
                    }
                }
            });
        });
    });

    Object.values(updated).forEach(m => {
        if(m.score !== 'Freilos' && m.originalPlayer1 !== 'Freilos' && m.originalPlayer2 !== 'Freilos') {
            m.conflictPlayers = [...extractPlayers(m.player1), ...extractPlayers(m.player2)];
        }
    });

    return updated;
};

const parseTime = (timeStr) => { 
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number); 
    return h * 60 + m; 
};

const formatTime = (mins) => {
    const h = Math.floor(mins / 60).toString().padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
};

const applyTimesToSlots = (slots, matches, startTime, matchDuration, breakDuration, finalDuration, kinderShortFinals) => {
    let currentMins = parseTime(startTime);
    slots.forEach((slot, idx) => {
        slot.slotIndex = idx;
        slot.time = formatTime(currentMins);
        
        let isFinalSlot = slot.matchIds.some(id => matches[id]?.stage === 'final' && !(matches[id] && kinderShortFinals[matches[id].category]));
        slot.slotType = isFinalSlot ? 'final' : 'regular';
        
        let duration = isFinalSlot ? finalDuration : matchDuration; 
        slot.endTime = formatTime(currentMins + duration);
        currentMins += duration + breakDuration; 
    });
    return slots;
};

const buildDynamicSchedule = (matches, currentSlots, numCourts, startTime, matchDuration, breakDuration, finalDuration, grandFinalCategories, scheduleAllFinalsAtEnd, kinderCategories = [], kinderCourts = {}, kinderShortFinals = {}) => {
    let allMatches = Object.values(matches);
    let finishedIds = new Set(allMatches.filter(m => m.winner || m.score === 'Freilos').map(m => m.id));

    let lockedPlacement = {}; 
    if (currentSlots) {
        currentSlots.forEach((slot, idx) => {
            slot.matchIds.forEach(id => {
                if (finishedIds.has(id) && matches[id].score !== 'Freilos' && !matches[id].manualTime) {
                    lockedPlacement[id] = idx;
                }
            });
        });
    }

    let matchEndSlot = {};
    let slots = [];

    const getSlot = (idx) => {
        while (slots.length <= idx) slots.push({ courts: new Array(numCourts).fill(null), activePlayers: new Set() });
        return slots[idx];
    };

    Object.entries(lockedPlacement).forEach(([idStr, sIdx]) => {
        let id = parseInt(idStr);
        let slot = getSlot(sIdx);
        let match = matches[id];
        
        let courtIdx = (match && match.court) ? (match.court - 1) : -1;
        if (courtIdx === -1 || courtIdx >= numCourts || slot.courts[courtIdx] !== null) {
            courtIdx = slot.courts.findIndex(c => c === null);
        }
        if (courtIdx !== -1) {
            slot.courts[courtIdx] = id;
            if (match && match.score !== 'Freilos') {
                match.conflictPlayers.forEach(p => slot.activePlayers.add(p));
            }
        }
        matchEndSlot[id] = sIdx + 1;
    });

    const isGrandFinal = (m) => m.stage === 'final' && !kinderShortFinals[m.category] && (scheduleAllFinalsAtEnd || grandFinalCategories.includes(m.category));

    let pendingPhase1 = allMatches.filter(m => !finishedIds.has(m.id) && !m.manualTime && m.score !== 'Freilos' && !isGrandFinal(m));
    let currentSlotIdx = 0;

    while (pendingPhase1.length > 0) {
        let slot = getSlot(currentSlotIdx);
        let availableCourts = slot.courts.filter(c => c === null).length;

        if (availableCourts > 0) {
            let readyMatches = pendingPhase1.filter(m => {
                if (m.stage === 'group') return true;
                if (m.stage === 'ko') {
                    const prevRound = m.koRound * 2;
                    const prevMatches = allMatches.filter(x => x.category === m.category && x.koRound === prevRound);
                    if (prevMatches.length > 0) {
                        return prevMatches.every(pm => (pm.score === 'Freilos' || (matchEndSlot[pm.id] !== undefined && matchEndSlot[pm.id] <= currentSlotIdx)));
                    } else {
                        const catGroups = allMatches.filter(x => x.category === m.category && x.stage === 'group');
                        if (catGroups.length > 0) {
                            return catGroups.every(g => matchEndSlot[g.id] !== undefined && matchEndSlot[g.id] <= currentSlotIdx);
                        }
                        return true;
                    }
                }
                if (m.stage === 'final') {
                    const catKo = allMatches.filter(x => x.category === m.category && x.stage === 'ko');
                    if (catKo.length > 0) {
                        const catSemis = catKo.filter(x => x.koRound === 2);
                        if (catSemis.length > 0) {
                            return catSemis.every(s => (s.score === 'Freilos' || (matchEndSlot[s.id] !== undefined && matchEndSlot[s.id] <= currentSlotIdx)));
                        }
                        return catKo.every(k => (k.score === 'Freilos' || (matchEndSlot[k.id] !== undefined && matchEndSlot[k.id] <= currentSlotIdx)));
                    } else {
                        const catGroups = allMatches.filter(x => x.category === m.category && x.stage === 'group');
                        if (catGroups.length > 0) {
                            return catGroups.every(g => matchEndSlot[g.id] !== undefined && matchEndSlot[g.id] <= currentSlotIdx);
                        }
                        return true;
                    }
                }
                return false;
            });

            readyMatches.sort((a, b) => {
                const aK = kinderCategories.includes(a.category);
                const bK = kinderCategories.includes(b.category);
                if (aK && !bK) return -1;
                if (!aK && bK) return 1;
                return 0;
            });

            for (let m of readyMatches) {
                if (slot.courts.filter(c => c === null).length === 0) break;
                
                const isKinder = kinderCategories.includes(m.category);

                if (!m.conflictPlayers.some(p => slot.activePlayers.has(p))) {
                    let assignedCourt = -1;
                    
                    if (isKinder) {
                        let targetCourt = kinderCourts[m.category] ?? 0;
                        if (targetCourt >= numCourts) targetCourt = 0; 
                        
                        if (slot.courts[targetCourt] === null) {
                            assignedCourt = targetCourt;
                        }
                    } else {
                        let emptyCourts = [];
                        for(let i=0; i<numCourts; i++) if(slot.courts[i] === null) emptyCourts.push(i);
                        
                        if (emptyCourts.length > 0) {
                            let pendingKinderCourts = new Set(
                                pendingPhase1
                                    .filter(pm => kinderCategories.includes(pm.category))
                                    .map(pm => {
                                        let c = kinderCourts[pm.category] ?? 0;
                                        return c >= numCourts ? 0 : c;
                                    })
                            );
                            
                            let nonReservedCourts = emptyCourts.filter(c => !pendingKinderCourts.has(c));
                            if (nonReservedCourts.length > 0) {
                                assignedCourt = nonReservedCourts[0];
                            } else {
                                assignedCourt = emptyCourts[0];
                            }
                        }
                    }

                    if (assignedCourt !== -1) {
                        slot.courts[assignedCourt] = m.id;
                        m.conflictPlayers.forEach(p => slot.activePlayers.add(p));
                        matchEndSlot[m.id] = currentSlotIdx + 1;
                        pendingPhase1 = pendingPhase1.filter(x => x.id !== m.id);
                    }
                }
            }
        }
        currentSlotIdx++;
        if (currentSlotIdx > 200) break;
    }

    let phase2StartIdx = 0;
    allMatches.forEach(m => {
        if (!m.manualTime && !isGrandFinal(m) && matchEndSlot[m.id]) {
            phase2StartIdx = Math.max(phase2StartIdx, matchEndSlot[m.id]);
        }
    });

    let pendingPhase2 = allMatches.filter(m => !finishedIds.has(m.id) && m.stage === 'final' && !m.manualTime && m.score !== 'Freilos' && isGrandFinal(m));
    currentSlotIdx = phase2StartIdx;

    while (pendingPhase2.length > 0) {
        let slot = getSlot(currentSlotIdx);
        let availableCourts = slot.courts.filter(c => c === null).length;

        if (availableCourts > 0) {
            let readyFinals = [...pendingPhase2].sort((a, b) => {
                const aK = kinderCategories.includes(a.category);
                const bK = kinderCategories.includes(b.category);
                if (aK && !bK) return -1;
                if (!aK && bK) return 1;
                return 0;
            });

            for (let m of readyFinals) {
                if (slot.courts.filter(c => c === null).length === 0) break;
                
                const isKinder = kinderCategories.includes(m.category);

                if (!m.conflictPlayers.some(p => slot.activePlayers.has(p))) {
                    let assignedCourt = -1;
                    if (isKinder) {
                        let targetCourt = kinderCourts[m.category] ?? 0;
                        if (targetCourt >= numCourts) targetCourt = 0; 
                        
                        if (slot.courts[targetCourt] === null) {
                            assignedCourt = targetCourt;
                        }
                    } else {
                        let emptyCourts = [];
                        for(let i=0; i<numCourts; i++) if(slot.courts[i] === null) emptyCourts.push(i);
                        if (emptyCourts.length > 0) {
                            let pendingKinderCourts = new Set(
                                pendingPhase2
                                    .filter(pm => kinderCategories.includes(pm.category))
                                    .map(pm => {
                                        let c = kinderCourts[pm.category] ?? 0;
                                        return c >= numCourts ? 0 : c;
                                    })
                            );
                            let nonReservedCourts = emptyCourts.filter(c => !pendingKinderCourts.has(c));
                            if (nonReservedCourts.length > 0) {
                                assignedCourt = nonReservedCourts[0];
                            } else {
                                assignedCourt = emptyCourts[0];
                            }
                        }
                    }

                    if (assignedCourt !== -1) {
                        slot.courts[assignedCourt] = m.id;
                        m.conflictPlayers.forEach(p => slot.activePlayers.add(p));
                        matchEndSlot[m.id] = currentSlotIdx + 1;
                        pendingPhase2 = pendingPhase2.filter(x => x.id !== m.id);
                    }
                }
            }
        }
        currentSlotIdx++;
        if (currentSlotIdx > 300) break;
    }

    let finalSlots = slots.filter(s => s.courts.some(c => c !== null));
    
    finalSlots.forEach(slot => {
        slot.matchIds = slot.courts.filter(Boolean);
        slot.courts.forEach((id, idx) => {
            if(id && matches[id]) matches[id].court = idx + 1;
        });
    });

    finalSlots = applyTimesToSlots(finalSlots, matches, startTime, matchDuration, breakDuration, finalDuration, kinderShortFinals);

    let manualMatches = allMatches.filter(m => m.manualTime && m.score !== 'Freilos');
    let manualSlotsMap = {}; 
    manualMatches.forEach(m => {
        if (!manualSlotsMap[m.manualTime]) {
            manualSlotsMap[m.manualTime] = { matchIds: [], time: m.manualTime, slotType: 'final' };
        }
        manualSlotsMap[m.manualTime].matchIds.push(m.id);
    });

    let manualSlots = Object.values(manualSlotsMap).map(slot => {
        slot.endTime = formatTime(parseTime(slot.time) + finalDuration);
        slot.matchIds.forEach((id, idx) => {
            if(matches[id]) matches[id].court = idx + 1;
        });
        return slot;
    });

    let combinedSlots = [...finalSlots, ...manualSlots];
    combinedSlots.sort((a, b) => parseTime(a.time) - parseTime(b.time));
    combinedSlots.forEach((slot, idx) => {
        slot.slotIndex = idx;
        if (slot.activePlayers) {
            delete slot.activePlayers;
        }
    });

    return combinedSlots;
};

function BracketsView({ categories, tournamentStructures, matchData }) {
    return (
        <div className="space-y-8 pb-20 w-full">
            {categories.map((cat, index) => {
            const data = tournamentStructures[cat];
            if (!data) return null;
            
            const catMatches = Object.values(matchData).filter(m => m.category === cat);
            const koMatches = catMatches.filter(m => m.stage === 'ko');
            const final = catMatches.find(m => m.stage === 'final' && (!m.koRound || m.koRound === 1));
            const hasKo = koMatches.length > 0 || final;

            return (
                <div key={cat} className={`bg-white rounded-xl shadow-sm border border-slate-200 p-6 overflow-hidden print:break-after-page print:border-none print:shadow-none print:p-0 ${index > 0 ? 'print:pt-4' : ''} w-full`}>
                <h3 className="text-xl font-bold text-teal-700 mb-6 border-b pb-2 flex justify-between items-center text-left">
                    {cat}
                    {data.type === 'knockout' && <span className="text-xs bg-teal-100 text-teal-800 px-2 py-1 rounded uppercase tracking-widest font-bold">K.O.-System</span>}
                </h3>
                
                {data.type === 'knockout' ? (
                    <div className="flex gap-4 items-center overflow-x-auto p-4 bg-slate-50/50 rounded-xl border border-slate-100 shadow-inner min-h-[300px] print:bg-transparent print:border-none print:shadow-none w-full">
                        {[...new Set(koMatches.map(m => m.koRound))].sort((a,b)=>b-a).map(r => {
                            const mInRound = koMatches.filter(m => m.koRound === r).sort((a,b)=>a.matchIndex - b.matchIndex);
                            return (
                                <div key={r} className="flex flex-col gap-6 justify-around min-w-[200px] h-full text-left">
                                    {mInRound.map(m => (
                                        <div key={m.id} className={`bg-white border-2 border-slate-200 p-2 rounded-lg shadow-sm text-sm font-medium text-slate-800 relative z-10 ${m.score === 'Freilos' ? 'opacity-50 print:opacity-100 print:border-dashed' : ''}`}>
                                            <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">{m.name}</div>
                                            <div className={`break-words p-1 rounded ${m.winner === m.player1 && m.score !== 'Freilos' ? 'bg-teal-50 font-bold text-teal-700 print:bg-transparent' : ''}`}>{m.player1}</div>
                                            <div className="border-t border-slate-100 my-1"></div>
                                            <div className={`break-words p-1 rounded ${m.winner === m.player2 && m.score !== 'Freilos' ? 'bg-teal-50 font-bold text-teal-700 print:bg-transparent' : ''}`}>{m.player2}</div>
                                        </div>
                                    ))}
                                </div>
                            )
                        })}
                        
                        {final && (
                            <div className="flex flex-col w-full min-w-[220px] relative z-10 bg-amber-50 border border-amber-200 p-4 rounded-xl ml-4 print:bg-transparent print:border-2 text-left">
                                <div className="text-center text-xs text-amber-600 font-black tracking-widest uppercase mb-3 flex items-center justify-center gap-1"><Trophy size={14}/> {final.name}</div>
                                <div className="bg-white border-2 border-amber-300 p-2 rounded-lg shadow-sm text-sm font-bold text-slate-800">
                                    <div className={`break-words p-1 rounded ${final.winner === final.player1 ? 'bg-amber-100 print:bg-transparent' : ''}`}>{final.player1}</div>
                                    <div className="border-t border-slate-100 my-1"></div>
                                    <div className={`break-words p-1 rounded ${final.winner === final.player2 ? 'bg-amber-100 print:bg-transparent' : ''}`}>{final.player2}</div>
                                </div>
                                {final.winner && (
                                    <div className="mt-3 text-center">
                                        <span className="bg-amber-400 text-amber-900 text-xs px-3 py-1 rounded-full font-bold shadow-sm print:border print:border-amber-400 print:bg-transparent">Sieger: {final.winner}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col lg:flex-row gap-8 w-full text-left">
                        {Object.keys(data.groups || {}).length > 0 && (
                        <div className="flex-1 space-y-4">
                            <h4 className="font-semibold text-slate-600 flex items-center gap-2">Gruppenphase (Standings)</h4>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
                            {Object.keys(data.groups).map((gName, idx) => {
                                const standings = calculateStandings(gName, data, catMatches);
                                const groupMatchesForTable = catMatches.filter(m => m.stage === 'group' && m.groupName === gName);

                                return (
                                <div key={idx} className="border border-slate-200 rounded-lg overflow-hidden shadow-sm flex flex-col print:break-inside-avoid w-full">
                                    <div className="bg-slate-50 px-4 py-2 font-bold text-sm text-slate-700 border-b flex justify-between print:bg-transparent">
                                    <span>{gName}</span>
                                    </div>
                                    
                                    <div className="bg-slate-50 flex text-xs font-bold text-slate-500 border-b px-4 py-1.5 print:bg-transparent">
                                    <div className="w-1/2">Spieler</div>
                                    <div className="flex w-1/2 justify-end gap-3 text-center">
                                        <div className="w-6" title="Siege">S</div>
                                        <div className="w-10" title="Spiele">G</div>
                                        <div className="w-8" title="Differenz">+/-</div>
                                    </div>
                                    </div>

                                    <ul className="divide-y divide-slate-100 bg-white border-b border-slate-200">
                                    {standings.map((p, pIdx) => (
                                        <li key={pIdx} className="px-4 py-2.5 text-sm text-slate-800 flex justify-between items-center hover:bg-slate-50 transition-colors">
                                        <span className="font-medium break-words w-1/2 pr-2">{pIdx + 1}. {p.name}</span>
                                        <div className="flex w-1/2 justify-end gap-3 text-center font-mono">
                                            <span className="w-6 font-bold text-teal-600 bg-teal-50 rounded print:bg-transparent print:text-black">{p.wins}</span>
                                            <span className="w-10 text-slate-500 text-xs flex items-center justify-center">{p.gamesWon}:{p.gamesLost}</span>
                                            <span className={`w-8 font-medium text-xs flex items-center justify-center ${p.diff > 0 ? 'text-green-600' : p.diff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                            {p.diff > 0 ? '+' : ''}{p.diff}
                                            </span>
                                        </div>
                                        </li>
                                    ))}
                                    </ul>

                                    <div className="bg-slate-50 px-4 py-3 h-full print:bg-transparent">
                                        <h5 className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Gruppenspiele</h5>
                                        <div className="space-y-1.5">
                                            {groupMatchesForTable.map(m => (
                                                <div key={m.id} className="text-xs flex justify-between items-center bg-white p-1.5 rounded border border-slate-200 shadow-sm print:shadow-none print:border-b-0">
                                                    <span className={`break-words w-[42%] ${m.winner === m.player1 ? 'font-bold text-teal-700 print:text-black' : 'text-slate-600'}`}>{m.player1}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono text-center w-1/6 bg-slate-50 rounded px-1 print:bg-transparent print:text-black">{m.score || '-:-'}</span>
                                                    <span className={`break-words w-[42%] text-right ${m.winner === m.player2 ? 'font-bold text-teal-700 print:text-black' : 'text-slate-600'}`}>{m.player2}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                )
                            })}
                            </div>
                        </div>
                        )}
                        
                        {hasKo && (
                        <div className="flex-1 border-l border-slate-100 pl-0 lg:pl-8 mt-8 lg:mt-0 print:border-none print:pl-0 w-full overflow-hidden">
                            <h4 className="font-semibold text-slate-600 mb-4 print:hidden">K.O.-Runde</h4>
                            <div className="flex gap-4 items-center h-full min-h-[200px] bg-slate-50/50 rounded-xl border border-slate-100 p-6 overflow-x-auto relative shadow-inner print:bg-transparent print:border-none print:shadow-none print:p-0">
                            
                            {[...new Set(koMatches.map(m => m.koRound))].sort((a,b)=>b-a).map(r => {
                                const mInRound = koMatches.filter(m => m.koRound === r).sort((a,b)=>a.matchIndex - b.matchIndex);
                                return (
                                    <div key={r} className="flex flex-col gap-6 justify-around min-w-[200px] h-full text-left">
                                        {mInRound.map(m => (
                                            <div key={m.id} className={`bg-white border-2 border-slate-200 p-2 rounded-lg shadow-sm text-sm font-medium text-slate-800 relative z-10 ${m.score === 'Freilos' ? 'opacity-50 print:opacity-100 print:border-dashed' : ''} print:shadow-none`}>
                                                <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">{m.name}</div>
                                                <div className={`break-words p-1 rounded ${m.winner === m.player1 && m.score !== 'Freilos' ? 'bg-teal-50 font-bold text-teal-700 print:bg-transparent' : ''}`}>{m.player1}</div>
                                                <div className="border-t border-slate-100 my-1"></div>
                                                <div className={`break-words p-1 rounded ${m.winner === m.player2 && m.score !== 'Freilos' ? 'bg-teal-50 font-bold text-teal-700 print:bg-transparent' : ''}`}>{m.player2}</div>
                                            </div>
                                        ))}
                                    </div>
                                )
                            })}

                            {koMatches.length > 0 && final && (
                                <div className="flex-1 flex justify-center text-slate-300 print:hidden"><ChevronRight size={32} /></div>
                            )}

                            {final && (
                                <div className="flex flex-col w-full min-w-[220px] relative z-10 bg-amber-50 border border-amber-200 p-4 rounded-xl print:bg-transparent print:border-2 text-left">
                                <div className="text-center text-xs text-amber-600 font-black tracking-widest uppercase mb-3 flex items-center justify-center gap-1"><Trophy size={14}/> {final.name}</div>
                                <div className="bg-white border-2 border-amber-300 p-2 rounded-lg shadow-sm text-sm font-bold text-slate-800 print:shadow-none">
                                    <div className={`break-words p-1 rounded ${final.winner === final.player1 ? 'bg-amber-100 print:bg-transparent' : ''}`}>{final.player1}</div>
                                    <div className="border-t border-slate-100 my-1"></div>
                                    <div className={`break-words p-1 rounded ${final.winner === final.player2 ? 'bg-amber-100 print:bg-transparent' : ''}`}>{final.player2}</div>
                                </div>
                                {final.winner && (
                                    <div className="mt-3 text-center">
                                        <span className="bg-amber-400 text-amber-900 text-xs px-3 py-1 rounded-full font-bold shadow-sm print:border print:border-amber-400 print:bg-transparent">Sieger: {final.winner}</span>
                                    </div>
                                )}
                                </div>
                            )}
                            </div>
                        </div>
                        )}
                    </div>
                )}
                </div>
            );
            })}
        </div>
    );
}

function MonitorView({ timeSlots, matchData, tournamentStructures, categories, onExit }) {
  const [activeIndices, setActiveIndices] = useState([0, 1]);
  const [monitorTab, setMonitorTab] = useState('live');

  useEffect(() => {
    if (!timeSlots || timeSlots.length === 0) return;
    
    const findActiveSlots = () => {
        let firstUnfinished = -1;
        for (let i = 0; i < timeSlots.length; i++) {
            const slot = timeSlots[i];
            let isCompleted = true;
            for (const id of slot.matchIds) {
                const match = matchData[id];
                if (match && match.score !== 'Freilos' && !match.winner) {
                    isCompleted = false;
                    break;
                }
            }
            if (!isCompleted) {
                firstUnfinished = i;
                break;
            }
        }
        
        if (firstUnfinished !== -1) {
            let secondUnfinished = firstUnfinished + 1;
            while (secondUnfinished < timeSlots.length) {
                const slot = timeSlots[secondUnfinished];
                let isCompleted = true;
                for (const id of slot.matchIds) {
                    const match = matchData[id];
                    if (match && match.score !== 'Freilos' && !match.winner) {
                        isCompleted = false;
                        break;
                    }
                }
                if (!isCompleted) break;
                secondUnfinished++;
            }
            if (secondUnfinished >= timeSlots.length) secondUnfinished = firstUnfinished;
            setActiveIndices([firstUnfinished, Math.min(secondUnfinished, timeSlots.length - 1)]);
        } else {
            const last = Math.max(0, timeSlots.length - 1);
            setActiveIndices([Math.max(0, last - 1), last]);
        }
    };
    
    findActiveSlots();
  }, [timeSlots, matchData]);

  if (!timeSlots || timeSlots.length === 0) {
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-slate-100 w-full relative">
             <button onClick={onExit} className="absolute top-6 right-6 p-3 rounded-full hover:bg-slate-700 text-slate-400 transition-colors">
                <X size={24} />
             </button>
             <Trophy className="w-24 h-24 text-teal-500 mb-6" />
             <h1 className="text-4xl font-bold mb-4 text-center">TC Wannweil Vereinsmeisterschaft</h1>
             <p className="text-xl text-slate-400 text-center">Es wurde noch kein Spielplan generiert.</p>
          </div>
      );
  }

  const slot1 = timeSlots[activeIndices[0]];
  const slot2 = timeSlots[activeIndices[1]];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans relative overflow-hidden w-full">
        <header className="bg-slate-800 p-4 md:p-6 flex justify-between items-center shadow-lg border-b border-slate-700 w-full">
            <div className="flex items-center gap-3 md:gap-4">
                <Trophy className="w-8 h-8 md:w-10 md:h-10 text-teal-400" />
                <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">TC Wannweil</h1>
                    <p className="text-teal-400 text-sm md:text-lg font-medium">Turnier Monitor</p>
                </div>
            </div>
            <div className="flex items-center gap-4 md:gap-6">
                <button onClick={onExit} className="p-2 md:p-3 rounded-full hover:bg-slate-700 text-slate-400 transition-colors" title="Monitoransicht beenden">
                    <X size={24} />
                </button>
            </div>
        </header>

        <div className="flex bg-slate-800 p-2 md:p-4 gap-2 justify-center border-b border-slate-700 xl:hidden">
            <button onClick={() => setMonitorTab('live')} className={`px-4 md:px-8 py-2 rounded-lg font-bold text-sm md:text-base transition-colors ${monitorTab === 'live' ? 'bg-teal-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-700'}`}>Live Spiele</button>
            <button onClick={() => setMonitorTab('brackets')} className={`px-4 md:px-8 py-2 rounded-lg font-bold text-sm md:text-base transition-colors ${monitorTab === 'brackets' ? 'bg-teal-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-700'}`}>Tabellen & Turnierbaum</button>
        </div>

        <div className="flex-1 p-4 md:p-8 flex flex-col gap-8 overflow-y-auto pb-32 w-full text-center">
            {monitorTab === 'live' ? (
                <>
                    {slot1 && (
                        <section className="bg-slate-800 rounded-2xl p-4 md:p-6 shadow-2xl border border-teal-900/50 w-full text-left">
                            <h2 className="text-xl md:text-2xl font-bold mb-6 flex items-center gap-3 text-white">
                                <span className="bg-teal-500 text-white px-3 py-1 rounded-lg uppercase tracking-wider text-xs md:text-sm">Aktuell</span>
                                <Clock className="text-teal-400" /> {slot1.time || ''} - {slot1.endTime || ''} Uhr
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                                {(slot1.matchIds || []).map(id => {
                                    const match = matchData[id];
                                    if (!match) return null;
                                    return <MonitorMatchCard key={id} match={match} />
                                })}
                            </div>
                        </section>
                    )}

                    {slot2 && (
                        <section className="bg-slate-800/50 rounded-2xl p-4 md:p-6 border border-slate-700 w-full text-left">
                            <h2 className="text-lg md:text-xl font-bold mb-6 flex items-center gap-3 text-slate-300">
                                <span className="bg-slate-700 text-slate-300 px-3 py-1 rounded-lg uppercase tracking-wider text-xs md:text-sm">Als nächstes</span>
                                <Clock className="text-slate-400" /> {slot2.time || ''} - {slot2.endTime || ''} Uhr
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 opacity-80">
                                {(slot2.matchIds || []).map(id => {
                                    const match = matchData[id];
                                    if (!match) return null;
                                    return <MonitorMatchCard key={id} match={match} />
                                })}
                            </div>
                        </section>
                    )}
                </>
            ) : (
                <section className="bg-slate-50 text-slate-900 rounded-2xl p-4 md:p-8 border border-slate-200 w-full shadow-2xl">
                    <BracketsView categories={categories} tournamentStructures={tournamentStructures} matchData={matchData} />
                </section>
            )}
        </div>

        <div className="hidden xl:flex absolute bottom-4 right-4 md:bottom-6 md:right-6 bg-white p-3 md:p-4 rounded-xl shadow-2xl flex-col items-center gap-2 border-4 border-slate-800">
            <img src="adobe-express-qr-code (3).png" alt="QR Code" className="w-[100px] h-[100px] object-contain rounded bg-white p-1" />
            <span className="text-[10px] md:text-xs font-bold text-slate-800 uppercase tracking-wider">Plan auf dem Handy</span>
        </div>
    </div>
  );
}

function MonitorMatchCard({ match }) {
    if (!match) return null;
    const isPlaceholder = (match.player1 || '').includes('Gruppe') || (match.player1 || '').includes('Sieger') || (match.player1 || '').includes('Platz');
    
    return (
        <div className={`rounded-xl p-4 md:p-5 flex flex-col gap-3 h-full border-2 ${match.isFinal ? 'bg-amber-900/20 border-amber-500/50' : 'bg-slate-700/50 border-slate-600'}`}>
            <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] md:text-xs font-bold text-teal-400 uppercase tracking-wider">{match.category || ''}</span>
                    <span className="text-xs md:text-sm font-medium text-slate-300">{match.type || ''} {match.name && `- ${match.name}`}</span>
                </div>
                <div className="bg-slate-900 text-white font-black text-lg md:text-xl w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center shadow-inner shrink-0 ml-2">
                    {match.court || 1}
                </div>
            </div>
            
            <div className="flex flex-col gap-3 mt-2 flex-grow justify-center">
                <div className={`font-medium text-base md:text-lg leading-tight break-words ${match.winner === match.player1 ? 'text-teal-300 font-bold' : 'text-white'}`}>
                    {match.player1 || ''}
                </div>
                <div className="text-xs md:text-sm text-slate-500 font-serif italic text-center w-full my-[-8px]">vs</div>
                <div className={`font-medium text-base md:text-lg leading-tight break-words ${match.winner === match.player2 ? 'text-teal-300 font-bold' : 'text-white'}`}>
                    {match.player2 || ''}
                </div>
            </div>

            {match.score && (
                <div className="mt-3 bg-slate-900/50 py-2 rounded-lg text-center font-bold text-teal-300 tracking-wider">
                    {match.score}
                </div>
            )}
            
            {isPlaceholder && !match.score && (
                 <div className="mt-3 py-2 rounded-lg text-center text-xs md:text-sm font-medium text-slate-500">
                    {match.isFinal ? 'Finalisten noch offen' : 'Wartet auf Vorrunde'}
                 </div>
            )}
        </div>
    );
}

function SpielleiterView({ timeSlots, matchData, onSaveResult, isSavingToCloud, onExit }) {
    if (!timeSlots || timeSlots.length === 0) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-slate-800 w-full relative">
               <button onClick={onExit} className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-200 text-slate-500 transition-colors">
                  <X size={24} />
               </button>
               <Calendar className="w-16 h-16 text-slate-300 mb-4" />
               <p className="text-lg text-slate-500 text-center font-medium">Noch kein Spielplan vorhanden.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans relative w-full">
            <header className="bg-teal-700 p-4 shadow-md sticky top-0 z-50 flex justify-between items-center w-full">
                <div className="flex items-center gap-3">
                    <Edit2 className="w-6 h-6 text-teal-200" />
                    <div>
                        <h1 className="text-lg font-bold text-white leading-tight">Spielleiter</h1>
                        <p className="text-teal-200 text-xs font-medium flex items-center gap-1">
                            {isSavingToCloud ? <Cloud className="animate-pulse w-3 h-3" /> : <Cloud className="w-3 h-3" />}
                            {isSavingToCloud ? 'Speichert...' : 'Live-Sync aktiv'}
                        </p>
                    </div>
                </div>
                <button onClick={onExit} className="p-2 rounded-lg bg-teal-800 hover:bg-teal-900 text-white transition-colors text-sm font-medium flex items-center gap-2">
                    <LogIn size={16} className="rotate-180 hidden sm:block" /> Logout
                </button>
            </header>

            <div className="flex-1 p-3 sm:p-6 flex flex-col gap-6 overflow-y-auto w-full pb-20">
                {timeSlots.map((slot, index) => {
                    const matchIds = slot.matchIds || [];
                    const hasMatches = matchIds.some(id => matchData && matchData[id] && matchData[id].score !== 'Freilos');
                    if (!hasMatches) return null;

                    return (
                        <div key={index} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
                            <div className={`px-4 py-2 border-b flex items-center justify-between sticky top-0 z-40 ${slot.slotType === 'final' ? 'bg-amber-100 border-amber-200' : 'bg-slate-100 border-slate-200'}`}>
                                <div className="flex items-center gap-2 font-bold text-base text-slate-800">
                                    <Clock size={16} className={slot.slotType === 'final' ? 'text-amber-600' : 'text-slate-500'} />
                                    {slot.time || ''} - {slot.endTime || ''}
                                </div>
                                {slot.slotType === 'final' && (
                                    <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1"><Trophy size={10} /> Finals</span>
                                )}
                            </div>
                            <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
                                {matchIds.map(id => {
                                    const match = matchData ? matchData[id] : null;
                                    if (!match || match.score === 'Freilos') return null;
                                    return <SpielleiterMatchCard key={id} match={match} onSaveResult={onSaveResult} />;
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function SpielleiterMatchCard({ match, onSaveResult }) {
    const [isEditing, setIsEditing] = useState(false);
    const [scoreInput, setScoreInput] = useState(match?.score || '');
    const [winnerInput, setWinnerInput] = useState(match?.winner || '');

    useEffect(() => {
        setScoreInput(match?.score || '');
        setWinnerInput(match?.winner || '');
    }, [match?.score, match?.winner]);

    if (!match) return null;
    const p1 = match?.player1 || '';
    const isPlaceholder = p1.includes('Gruppe') || p1.includes('Sieger') || p1.includes('Platz');

    const handleScoreChange = (e) => {
        const val = e.target.value;
        setScoreInput(val);
        
        if (!match.isFinal) {
            const parsed = val.match(/^(\d+)\s*:\s*(\d+)$/);
            if (parsed) {
                const s1 = parseInt(parsed[1], 10);
                const s2 = parseInt(parsed[2], 10);
                if (s1 > s2) setWinnerInput(match.player1);
                else if (s2 > s1) setWinnerInput(match.player2);
                else setWinnerInput('');
            } else {
                setWinnerInput('');
            }
        }
    };

    const handleSave = () => {
        onSaveResult(match.id, scoreInput, winnerInput);
        setIsEditing(false);
    };

    return (
        <div className={`border-2 rounded-xl p-4 relative flex flex-col h-full w-full ${match.isFinal ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 bg-white shadow-sm'}`}>
            <div className="flex justify-between items-start mb-3">
                <div>
                    <div className="text-xs font-black text-teal-600 uppercase tracking-wider">{match.category || ''}</div>
                    <div className="text-xs font-semibold text-slate-500">{match.type || ''} {match.name && `- ${match.name}`}</div>
                </div>
                <div className="bg-slate-800 text-white font-bold text-lg w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                    {match.court || 1}
                </div>
            </div>

            <div className="flex flex-col gap-2 flex-grow mt-1">
                <div className={`font-medium text-base leading-tight break-words flex gap-2 ${match.winner === match.player1 ? 'text-teal-700 font-bold' : 'text-slate-800'}`}>
                    <span className="text-slate-400 font-mono text-sm mt-0.5">1</span> {match.player1 || ''}
                </div>
                <div className="text-xs text-slate-400 font-serif italic py-0.5">vs</div>
                <div className={`font-medium text-base leading-tight break-words flex gap-2 ${match.winner === match.player2 ? 'text-teal-700 font-bold' : 'text-slate-800'}`}>
                    <span className="text-slate-400 font-mono text-sm mt-0.5">2</span> {match.player2 || ''}
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100">
                {!isPlaceholder ? (
                    !isEditing && match.winner ? (
                        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200 active:bg-slate-100 cursor-pointer" onClick={() => setIsEditing(true)}>
                            <div className="text-base font-bold text-slate-800">{match.score || ''}</div>
                            <div className="text-teal-600 flex items-center gap-1 text-sm font-medium"><Edit2 size={16} /> Ändern</div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <input 
                                type="text" 
                                inputMode="text"
                                placeholder={match.isFinal ? "z.B. 6:4, 6:2" : "z.B. 10:5"} 
                                className="w-full text-base p-3 border-2 border-slate-300 rounded-lg focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none font-bold text-center" 
                                value={scoreInput} 
                                onChange={handleScoreChange} 
                            />
                            
                            {match.isFinal ? (
                                <div className="flex flex-col gap-2">
                                    <div className="text-xs text-center text-slate-500 font-medium">Wer hat gewonnen?</div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setWinnerInput(match.player1)} className={`flex-1 text-xs sm:text-sm py-2.5 rounded-lg border-2 transition-colors font-bold ${winnerInput === match.player1 ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>Sieg 1</button>
                                        <button onClick={() => setWinnerInput(match.player2)} className={`flex-1 text-xs sm:text-sm py-2.5 rounded-lg border-2 transition-colors font-bold ${winnerInput === match.player2 ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>Sieg 2</button>
                                    </div>
                                    <button onClick={handleSave} disabled={!winnerInput || !scoreInput} className="w-full bg-teal-600 text-white text-sm py-3 rounded-lg font-bold shadow-md disabled:opacity-50 mt-1 flex justify-center items-center gap-2"><Check size={18} /> Speichern</button>
                                </div>
                            ) : (
                                <button onClick={handleSave} disabled={!winnerInput || !scoreInput} className="w-full bg-teal-600 text-white text-sm py-3 rounded-lg font-bold shadow-md disabled:opacity-50 flex justify-center items-center gap-2 transition-colors"><Check size={18} /> Ergebnis Speichern</button>
                            )}
                        </div>
                    )
                ) : (
                    <div className="text-sm text-center text-slate-400 font-medium bg-slate-50 py-3 rounded-lg border border-slate-100">
                       Wartet auf Vorrunden
                    </div>
                )}
            </div>
        </div>
    );
}

function LoginScreen({ onLoginAdmin, onLoginSpielleiter, onMonitor, initialMode }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loginType, setLoginType] = useState(initialMode === 'spielleiter' ? 'spielleiter' : 'admin');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (loginType === 'admin') {
            if (password === 'tcw2026') onLoginAdmin();
            else setError('Falsches Admin-Passwort');
        } else if (loginType === 'spielleiter') {
            if (password === 'ergebnis26') onLoginSpielleiter();
            else setError('Falsches Spielleiter-Passwort');
        }
        if (error) setPassword('');
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 w-full">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
                <div className="flex flex-col items-center mb-6">
                    <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mb-4">
                        <Lock className="w-8 h-8 text-teal-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800 text-center">TC Wannweil</h1>
                    <p className="text-slate-500 text-sm mt-1">Turnier Login</p>
                </div>
                
                <div className="flex bg-slate-100 p-1 rounded-lg mb-6">
                    <button type="button" onClick={() => {setLoginType('admin'); setError(''); setPassword('');}} className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${loginType === 'admin' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Verwaltung</button>
                    <button type="button" onClick={() => {setLoginType('spielleiter'); setError(''); setPassword('');}} className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${loginType === 'spielleiter' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Spielleiter</button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            {loginType === 'admin' ? 'Admin Passwort' : 'Spielleiter Passwort'}
                        </label>
                        <input 
                            type="password" 
                            autoFocus
                            className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 outline-none transition-all ${error ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                            placeholder="Passwort eingeben..."
                        />
                        {error && <p className="text-red-500 text-xs mt-2 font-medium">{error}</p>}
                    </div>
                    <button type="submit" className="w-full bg-teal-600 text-white font-bold py-3 rounded-lg hover:bg-teal-700 transition-colors flex items-center justify-center gap-2 mt-2">
                        <LogIn size={18} /> {loginType === 'admin' ? 'Verwaltung starten' : 'Erfassung starten'}
                    </button>
                </form>
                
                <div className="mt-4 pt-4 border-t border-slate-100">
                    <button onClick={onMonitor} className="w-full bg-slate-800 text-white font-bold py-3 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
                        <Monitor size={18} /> Nur Monitor-Ansicht
                    </button>
                    <p className="text-center text-xs text-slate-400 mt-3">Ideal für Smartphones oder den TV im Vereinsheim.</p>
                </div>
            </div>
        </div>
    );
}

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [isFirebaseInitialized, setIsFirebaseInitialized] = useState(false);
  const [isSavingToCloud, setIsSavingToCloud] = useState(false);

  const [viewMode, setViewMode] = useState(() => {
      if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const m = params.get('mode');
          if (m === 'monitor') return 'monitor';
          if (m === 'spielleiter') return 'spielleiter';
      }
      return 'manage';
  });
  
  const [loginRole, setLoginRole] = useState(() => {
      if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const m = params.get('mode');
          if (m === 'monitor') return 'monitor';
          if (m === 'spielleiter') return 'spielleiter';
      }
      return null;
  });
  
  const [activeTab, setActiveTab] = useState('applications');
  
  const [applications, setApplications] = useState({});
  const [rawAppInput, setRawAppInput] = useState('');

  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  
  const [grandFinals, setGrandFinals] = useState(["Herren-Einzel U60"]);
  const [kinderCategories, setKinderCategories] = useState([]);
  const [kinderCourts, setKinderCourts] = useState({});
  const [kinderShortFinals, setKinderShortFinals] = useState({});
  
  const [categoryModes, setCategoryModes] = useState({});
  const [groupCounts, setGroupCounts] = useState({});

  const [startTime, setStartTime] = useState('09:00');
  const [numCourts, setNumCourts] = useState(6);
  const [matchDuration, setMatchDuration] = useState(30);
  const [breakDuration, setBreakDuration] = useState(10);
  const [finalDuration, setFinalDuration] = useState(90);
  
  const [scheduleAllFinalsAtEnd, setScheduleAllFinalsAtEnd] = useState(true);
  
  const [participants, setParticipants] = useState(() => {
    const initial = {};
    DEFAULT_CATEGORIES.forEach(cat => initial[cat] = '');
    return initial;
  });

  const [timeSlots, setTimeSlots] = useState(null); 
  const [matchData, setMatchData] = useState({});   
  const [tournamentStructures, setTournamentStructures] = useState(null); 
  const [isGenerating, setIsGenerating] = useState(false);
  
  const fileInputRef = useRef(null);
  const appFileInputRef = useRef(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Firebase Auth Error:", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
    return () => unsubscribe();
  }, []);

  const loadFromCloud = async () => {
      if (!firebaseUser) return;
      try {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'tournamentData', 'main');
          const snap = await getDoc(docRef);
          if (snap.exists()) {
              const data = snap.data();
              if (data.__categories) setCategories(data.__categories);
              if (data.__grandFinals) setGrandFinals(data.__grandFinals);
              if (data.__kinderCategories) setKinderCategories(data.__kinderCategories);
              if (data.__kinderCourts) setKinderCourts(data.__kinderCourts);
              if (data.__kinderShortFinals) setKinderShortFinals(data.__kinderShortFinals);
              if (data.__categoryModes) setCategoryModes(data.__categoryModes);
              if (data.__groupCounts) setGroupCounts(data.__groupCounts);
              if (data.__settings) {
                  setScheduleAllFinalsAtEnd(data.__settings.scheduleAllFinalsAtEnd !== undefined ? data.__settings.scheduleAllFinalsAtEnd : true);
                  setNumCourts(data.__settings.numCourts !== undefined ? data.__settings.numCourts : 6);
              }
              if (data.__applications) setApplications(data.__applications);
              if (data.__matchData) setMatchData(data.__matchData);
              if (data.__tournamentStructures) setTournamentStructures(data.__tournamentStructures);
              if (data.__timeSlots) setTimeSlots(data.__timeSlots);
              if (data.__startTime) setStartTime(data.__startTime);
              if (data.__matchDuration) setMatchDuration(data.__matchDuration);
              if (data.__breakDuration) setBreakDuration(data.__breakDuration);
              if (data.__finalDuration) setFinalDuration(data.__finalDuration);
              
              const loadedParticipants = {};
              (data.__categories || DEFAULT_CATEGORIES).forEach(cat => {
                  if (data[cat] !== undefined) loadedParticipants[cat] = data[cat];
              });
              setParticipants(loadedParticipants);
          }
      } catch (e) {
          console.error("Error loading from cloud", e);
      }
  };

  useEffect(() => {
      if (firebaseUser && !isFirebaseInitialized) {
          loadFromCloud().then(() => setIsFirebaseInitialized(true));
      }
  }, [firebaseUser, isFirebaseInitialized]);

  // Real-time synchronization for Monitor & Spielleiter Views
  useEffect(() => {
      if (!firebaseUser || !isFirebaseInitialized) return;
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'tournamentData', 'main');
      const unsub = onSnapshot(docRef, (snap) => {
          if (snap.exists()) {
              const data = snap.data();
              if (viewMode === 'monitor' || viewMode === 'spielleiter') {
                  if (data.__categories) setCategories(data.__categories);
                  if (data.__timeSlots) setTimeSlots(data.__timeSlots);
                  if (data.__matchData) setMatchData(data.__matchData);
                  if (data.__tournamentStructures) setTournamentStructures(data.__tournamentStructures);
              }
          }
      }, (error) => console.error("Snapshot error:", error));
      
      return () => unsub();
  }, [firebaseUser, viewMode, isFirebaseInitialized]);

  // Master Save Function
  const saveToCloud = async () => {
      if (!firebaseUser) return;
      setIsSavingToCloud(true);
      try {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'tournamentData', 'main');
          const dataToSave = {
              ...participants,
              __categories: categories,
              __grandFinals: grandFinals,
              __kinderCategories: kinderCategories,
              __kinderCourts: kinderCourts,
              __kinderShortFinals: kinderShortFinals,
              __categoryModes: categoryModes,
              __groupCounts: groupCounts,
              __settings: { scheduleAllFinalsAtEnd, numCourts },
              __applications: applications,
              __matchData: matchData,
              __tournamentStructures: tournamentStructures,
              __timeSlots: timeSlots,
              __startTime: startTime,
              __matchDuration: matchDuration,
              __breakDuration: breakDuration,
              __finalDuration: finalDuration,
          };
          await setDoc(docRef, dataToSave);
      } catch(e) {
          console.error("Error saving to cloud", e);
      }
      setIsSavingToCloud(false);
  };

  // Continuous Auto-Save Trigger for all state changes in management view
  useEffect(() => {
      if (!isFirebaseInitialized || !firebaseUser || viewMode === 'monitor' || viewMode === 'spielleiter') return;
      const timeout = setTimeout(() => {
          saveToCloud();
      }, 1500);

      return () => clearTimeout(timeout);
  }, [
      participants, categories, grandFinals, kinderCategories, kinderCourts, kinderShortFinals, 
      categoryModes, groupCounts, scheduleAllFinalsAtEnd, numCourts, startTime, matchDuration, 
      breakDuration, finalDuration, matchData, tournamentStructures, timeSlots, applications,
      isFirebaseInitialized, firebaseUser, viewMode
  ]);

  const handleParseRawInput = () => {
      if (!rawAppInput.trim()) return;
      const lines = rawAppInput.split('\n').map(l => l.trim()).filter(l => l);
      let data = { entries: {} };
      let currentCategory = null;

      for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          if (line === 'SpielerIn' || line === 'Name') {
              if (lines[i+1] && !lines[i+1].includes(':')) data.name = lines[i+1];
          } 
          else if (line.startsWith('Mail:')) {
              data.mail = line.replace('Mail:', '').trim();
          } 
          else if (line.startsWith('Tel.:') || line.startsWith('Tel:')) {
              data.tel = line.replace(/Tel\.?:/, '').trim();
          } 
          else if (line === 'Teilnahme an:') {
              // Read all subsequent lines as categories until a new key (colon) is found
              let j = i + 1;
              while (j < lines.length && !lines[j].includes(':') && lines[j] !== 'SpielerIn' && lines[j] !== 'Name') {
                  const catLine = lines[j].trim();
                  if (catLine) {
                      const catList = catLine.split(',').map(c => c.trim()).filter(Boolean);
                      catList.forEach(c => {
                          let finalCat = c;
                          if (finalCat.toLowerCase() === 'doppel-mix' || finalCat.toLowerCase() === 'doppel mix') finalCat = 'Mixed';
                          currentCategory = finalCat;
                          if (!data.entries[finalCat]) data.entries[finalCat] = {};
                      });
                  }
                  j++;
              }
          } 
          else if (line === 'Doppel-PartnerIn:' || line === 'Doppel-Partner:') {
              let partner = lines[i+1];
              if (partner && partner !== 'N/A' && !partner.includes('N/A')) {
                  // Assign to a Doppel category if one exists, otherwise to currentCategory
                  let doppelCat = Object.keys(data.entries).find(c => c.toLowerCase().includes('doppel'));
                  if (doppelCat) {
                      data.entries[doppelCat].partner = partner;
                  } else if (currentCategory) {
                      data.entries[currentCategory].partner = partner;
                  }
              }
          } 
          else if (line === 'Mixed-PartnerIn:' || line === 'Mixed-Partner:') {
              let partner = lines[i+1];
              if (partner && partner !== 'N/A' && !partner.includes('N/A')) {
                  if (!data.entries['Mixed']) data.entries['Mixed'] = {};
                  data.entries['Mixed'].partner = partner;
              }
          }
      }

      if (data.name) {
          setApplications(prev => {
              const updated = { ...prev };
              if (updated[data.name]) {
                  updated[data.name].mail = data.mail || updated[data.name].mail;
                  updated[data.name].tel = data.tel || updated[data.name].tel;
                  updated[data.name].entries = { ...updated[data.name].entries, ...data.entries };
              } else {
                  updated[data.name] = data;
              }
              return updated;
          });
          setRawAppInput('');
      }
  };

  const handleExportApplications = () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(applications, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "anmeldungen_tc_wannweil.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  };

  const handleImportApplications = (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const loaded = JSON.parse(e.target.result);
              if (loaded && typeof loaded === 'object') {
                  setApplications(prev => ({ ...prev, ...loaded }));
              }
          } catch (err) {
              console.error("Fehler beim Importieren der Anmeldungen:", err);
          }
          event.target.value = '';
      };
      reader.readAsText(file);
  };

  const transferToParticipants = () => {
      let newParticipants = { ...participants };
      let newCategories = [...categories];
      
      // Helper for robust matching
      const normalizeCat = (c) => c.toLowerCase().replace(/[^a-z0-9öäüß]/g, '');
      
      // 1. Scan applications for new categories
      const appsCategories = new Set();
      Object.values(applications).forEach(app => {
          Object.keys(app.entries || {}).forEach(c => appsCategories.add(c));
      });
      
      // 2. Add any category that doesn't exist yet
      appsCategories.forEach(appCat => {
          const normalizedAppCat = normalizeCat(appCat);
          const exists = newCategories.some(existingCat => {
              const normExisting = normalizeCat(existingCat);
              return normExisting === normalizedAppCat || (normalizedAppCat === 'doppelmix' && normExisting === 'mixed') || (normalizedAppCat === 'mixed' && normExisting === 'mixed');
          });
          
          if (!exists) {
              let newCatName = appCat;
              if (normalizedAppCat === 'doppelmix') newCatName = 'Mixed';
              
              newCategories.push(newCatName);
              if (newParticipants[newCatName] === undefined) {
                  newParticipants[newCatName] = '';
              }
          }
      });

      // Update Categories State if we found new ones
      if (newCategories.length > categories.length) {
          setCategories(newCategories);
      }
      
      // 3. Process all categories (old and new)
      newCategories.forEach(cat => {
          let pairs = new Set();
          let generatedNames = [];
          
          const normalizedTargetCat = normalizeCat(cat);
          
          Object.values(applications).forEach(app => {
              // Find matching category in user application (ignoring hyphens/spaces)
              let entryKey = Object.keys(app.entries || {}).find(k => {
                  const normK = normalizeCat(k);
                  return normK === normalizedTargetCat || (normK === 'doppelmix' && normalizedTargetCat === 'mixed') || (normK === 'mixed' && normalizedTargetCat === 'mixed');
              });

              if (entryKey) {
                  const isDouble = cat.toLowerCase().includes('doppel') || cat.toLowerCase().includes('mix');
                  let partner = app.entries[entryKey].partner;
                  
                  if (isDouble && partner && partner !== 'N/A' && !partner.includes('N/A') && partner.trim() !== '') {
                      let p1Raw = app.name.trim();
                      let p2Raw = partner.trim();
                      
                      // Remove (m), (f), (k) or (w) tags
                      let p1Clean = p1Raw.replace(/\s*\([mfkw]\)/gi, '').trim();
                      let p2Clean = p2Raw.replace(/\s*\([mfkw]\)/gi, '').trim();
                      
                      let pairKey;
                      if (normalizedTargetCat === 'mixed' || normalizedTargetCat === 'doppelmix') {
                          // Check for female indicator or fallback to female first names
                          let p1Female = /\([fw]\)/i.test(p1Raw) || FIRST_NAMES_F.includes(p1Clean.split(' ')[0]);
                          let p2Female = /\([fw]\)/i.test(p2Raw) || FIRST_NAMES_F.includes(p2Clean.split(' ')[0]);
                          
                          if (p2Female && !p1Female) {
                              pairKey = `${p2Clean} / ${p1Clean}`; // Female first
                          } else if (p1Female && !p2Female) {
                              pairKey = `${p1Clean} / ${p2Clean}`; // Female first
                          } else {
                              pairKey = [p1Clean, p2Clean].sort().join(' / ');
                          }
                      } else {
                          pairKey = [p1Clean, p2Clean].sort().join(' / ');
                      }

                      if (!pairs.has(pairKey)) {
                          pairs.add(pairKey);
                          generatedNames.push(pairKey);
                      }
                  } else {
                      // Single player: just strip the gender tag
                      generatedNames.push(app.name.replace(/\s*\([mfkw]\)/gi, '').trim());
                  }
              }
          });
          
          if (generatedNames.length > 0) {
               const existingLines = (newParticipants[cat] || '').split('\n').map(l => l.trim()).filter(l=>l);
               const existingNames = new Set(existingLines.map(l => l.split(',')[0].trim()));
               const lkMap = {};
               
               existingLines.forEach(l => {
                   const parts = l.split(',');
                   if(parts.length > 1) {
                       lkMap[parts[0].trim()] = parts[1].trim();
                   }
               });

               // Keep existing manual entries!
               let finalLines = [...existingLines];

               generatedNames.forEach(name => {
                   const reversed = name.includes(' / ') ? name.split(' / ').reverse().join(' / ') : name;
                   
                   // Avoid adding duplicate players/teams
                   if (!existingNames.has(name) && !existingNames.has(reversed)) {
                       finalLines.push(name);
                   }
               });
               
               newParticipants[cat] = finalLines.join('\n');
          }
      });
      
      setParticipants(newParticipants);
      setActiveTab('participants'); 
  };

  const getMode = (cat) => categoryModes[cat] || 'standard';
  const getGroupCount = (cat) => groupCounts[cat] || 'auto';

  const setCategoryMode = (cat, mode) => {
      setCategoryModes(prev => ({ ...prev, [cat]: mode }));
      setTimeSlots(null); setTournamentStructures(null); setMatchData({});
  };

  const setGroupCount = (cat, countStr) => {
      setGroupCounts(prev => ({ ...prev, [cat]: countStr }));
      setTimeSlots(null); setTournamentStructures(null); setMatchData({});
  };

  if (!isFirebaseInitialized) {
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-slate-100 w-full relative">
             <Trophy className="w-16 h-16 text-teal-500 mb-6 animate-pulse" />
             <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-4"></div>
             <p className="text-lg text-slate-400 font-medium">Lade Turnierdaten aus der Cloud...</p>
          </div>
      );
  }

  if (loginRole === null && viewMode !== 'monitor') {
      return (
          <LoginScreen 
              initialMode={viewMode}
              onLoginAdmin={() => {
                  setLoginRole('admin');
                  setViewMode('manage');
                  if (typeof window !== 'undefined' && window.history && window.history.pushState) {
                      window.history.pushState({}, document.title, window.location.origin + window.location.pathname);
                  }
              }}
              onLoginSpielleiter={() => {
                  setLoginRole('spielleiter');
                  setViewMode('spielleiter');
                  if (typeof window !== 'undefined' && window.history && window.history.pushState) {
                      window.history.pushState({}, document.title, window.location.origin + window.location.pathname + '?mode=spielleiter');
                  }
              }} 
              onMonitor={() => { 
                  setLoginRole('monitor'); 
                  setViewMode('monitor'); 
                  if (typeof window !== 'undefined' && window.history && window.history.pushState) {
                      window.history.pushState({}, document.title, window.location.origin + window.location.pathname + '?mode=monitor');
                  }
              }} 
          />
      );
  }

  if (viewMode === 'monitor') {
      return <MonitorView 
          timeSlots={timeSlots} 
          matchData={matchData} 
          tournamentStructures={tournamentStructures}
          categories={categories}
          onExit={() => { 
              setLoginRole(null); 
              setViewMode('manage'); 
              if (typeof window !== 'undefined' && window.history && window.history.pushState) {
                  window.history.pushState({}, document.title, window.location.origin + window.location.pathname);
              }
          }} 
      />;
  }

  if (viewMode === 'spielleiter') {
      return <SpielleiterView 
          timeSlots={timeSlots} 
          matchData={matchData} 
          onSaveResult={handleUpdateResult}
          isSavingToCloud={isSavingToCloud}
          onExit={() => { 
              setLoginRole(null); 
              setViewMode('manage'); 
              if (typeof window !== 'undefined' && window.history && window.history.pushState) {
                  window.history.pushState({}, document.title, window.location.origin + window.location.pathname);
              }
          }} 
      />;
  }

  const handleAddCategory = () => {
      const name = newCategoryName.trim();
      if (name && !categories.includes(name)) {
          setCategories(prev => [...prev, name]);
          setParticipants(prev => ({ ...prev, [name]: '' }));
          setNewCategoryName('');
          setTimeSlots(null); setTournamentStructures(null); setMatchData({});
      }
  };

  const handleRemoveCategory = (catToRemove) => {
      setCategories(prev => prev.filter(c => c !== catToRemove));
      setGrandFinals(prev => prev.filter(c => c !== catToRemove));
      
      setKinderCategories(prev => prev.filter(c => c !== catToRemove));
      setKinderCourts(prev => { const updated = {...prev}; delete updated[catToRemove]; return updated; });
      setKinderShortFinals(prev => { const updated = {...prev}; delete updated[catToRemove]; return updated; });
      
      setCategoryModes(prev => { const updated = { ...prev }; delete updated[catToRemove]; return updated; });
      setGroupCounts(prev => { const updated = { ...prev }; delete updated[catToRemove]; return updated; });
      setParticipants(prev => { const updated = { ...prev }; delete updated[catToRemove]; return updated; });
      setTimeSlots(null); setTournamentStructures(null); setMatchData({});
  };

  const saveEditedCategory = (oldCat) => {
      const newCat = editCategoryName.trim();
      if (!newCat || newCat === oldCat) { setEditingCategory(null); return; }
      if (categories.includes(newCat)) { setEditingCategory(null); return; }

      setCategories(prev => prev.map(c => c === oldCat ? newCat : c));
      setGrandFinals(prev => prev.map(c => c === oldCat ? newCat : c));
      
      setKinderCategories(prev => prev.map(c => c === oldCat ? newCat : c));
      setKinderCourts(prev => {
          const updated = { ...prev };
          if (updated[oldCat] !== undefined) { updated[newCat] = updated[oldCat]; delete updated[oldCat]; }
          return updated;
      });
      setKinderShortFinals(prev => {
          const updated = { ...prev };
          if (updated[oldCat] !== undefined) { updated[newCat] = updated[oldCat]; delete updated[oldCat]; }
          return updated;
      });
      
      setCategoryModes(prev => {
          const updated = { ...prev };
          if (updated[oldCat]) { updated[newCat] = updated[oldCat]; delete updated[oldCat]; }
          return updated;
      });
      setGroupCounts(prev => {
          const updated = { ...prev };
          if (updated[oldCat]) { updated[newCat] = updated[oldCat]; delete updated[oldCat]; }
          return updated;
      });
      setParticipants(prev => {
          const updated = { ...prev };
          updated[newCat] = updated[oldCat]; delete updated[oldCat];
          return updated;
      });
      
      setTimeSlots(null); setTournamentStructures(null); setMatchData({}); setEditingCategory(null);
  };

  const toggleGrandFinal = (cat) => {
      setGrandFinals(prev => {
          if (prev.includes(cat)) return prev.filter(c => c !== cat);
          return [...prev, cat];
      });
      setTimeSlots(null); setTournamentStructures(null); setMatchData({});
  };

  const toggleKinderCategory = (cat) => {
      setKinderCategories(prev => {
          if (prev.includes(cat)) {
              setKinderCourts(p => { const o = {...p}; delete o[cat]; return o; });
              setKinderShortFinals(p => { const o = {...p}; delete o[cat]; return o; });
              return prev.filter(c => c !== cat);
          }
          return [...prev, cat];
      });
      setTimeSlots(null); setTournamentStructures(null); setMatchData({});
  };

  const setKinderCourt = (cat, courtIndex) => {
      setKinderCourts(prev => ({...prev, [cat]: courtIndex}));
      setTimeSlots(null); setTournamentStructures(null); setMatchData({});
  };

  const toggleKinderShortFinal = (cat) => {
      setKinderShortFinals(prev => ({...prev, [cat]: !prev[cat]}));
      setTimeSlots(null); setTournamentStructures(null); setMatchData({});
  };

  const handleParticipantChange = (category, value) => {
    setParticipants(prev => ({ ...prev, [category]: value }));
  };

  const addRandomPlayer = (category) => {
    let newEntry = "";
    const isFemale = category.includes("Damen");
    const isMix = category.includes("Mix");
    const isDouble = category.includes("Doppel") || isMix;
    const lk = Math.floor(Math.random() * 25) + 1; 

    const getPlayer = (gender) => {
        const firsts = gender === 'F' ? FIRST_NAMES_F : FIRST_NAMES_M;
        return `${getRandomItem(firsts)} ${getRandomItem(LAST_NAMES)}`;
    };

    if (isMix) {
      newEntry = `${getPlayer('M')} / ${getPlayer('F')}, ${lk}`;
    } else if (isDouble) {
      const g = isFemale ? 'F' : 'M';
      newEntry = `${getPlayer(g)} / ${getPlayer(g)}, ${lk}`;
    } else {
      let g = 'M';
      if (isFemale) g = 'F';
      if (category.toLowerCase().includes("kinder") && Math.random() > 0.5) g = 'F';
      newEntry = `${getPlayer(g)}, ${lk}`;
    }

    setParticipants(prev => {
      const current = prev[category].trim();
      const updated = current ? `${current}\n${newEntry}` : newEntry;
      return { ...prev, [category]: updated };
    });
  };

  const getParticipantsList = (category) => {
    return participants[category]?.split('\n').map(p => p.trim()).filter(p => p.length > 0) || [];
  };

  function handleUpdateResult(matchId, score, winner) {
    setMatchData(prevMatches => {
      let nextMatches = JSON.parse(JSON.stringify(prevMatches));
      if (nextMatches[matchId]) {
          nextMatches[matchId].score = score;
          nextMatches[matchId].winner = winner;
      }
      
      nextMatches = processTournamentProgressPure(nextMatches, tournamentStructures, categories);
      setTimeSlots(prevSlots => buildDynamicSchedule(nextMatches, prevSlots, numCourts, startTime, matchDuration, breakDuration, finalDuration, grandFinals, scheduleAllFinalsAtEnd, kinderCategories, kinderCourts, kinderShortFinals));
      
      return nextMatches;
    });
  }

  const handleManualTimeChange = (matchId, newTime) => {
    setMatchData(prevMatches => {
        let nextMatches = JSON.parse(JSON.stringify(prevMatches));
        if (nextMatches[matchId]) {
            nextMatches[matchId].manualTime = newTime;
        }
        
        setTimeSlots(prevSlots => buildDynamicSchedule(nextMatches, prevSlots, numCourts, startTime, matchDuration, breakDuration, finalDuration, grandFinals, scheduleAllFinalsAtEnd, kinderCategories, kinderCourts, kinderShortFinals));
        return nextMatches;
    });
  };

  const generateCategory = (category, playersData, mode, startId) => {
      let matchIdCounter = startId;
      const count = playersData.length;
      const players = playersData.map(p => p.name);
      
      let initialMatches = {};
      let catStructure = { type: '', groups: {}, playerCount: count };

      if (mode === 'knockout' || (mode !== 'group_only' && count > 12)) {
          catStructure.type = 'knockout';
          let bracketSize = Math.max(2, Math.pow(2, Math.ceil(Math.log2(count))));
          let seeds = getKnockoutSeeds(bracketSize);
          let roundCount = bracketSize / 2;

          for (let i = 0; i < roundCount; i++) {
              let p1 = players[seeds[i * 2]];
              let p2 = players[seeds[i * 2 + 1]];
              
              let isBye = !p1 || !p2;
              let winner = null;
              if (isBye) {
                  if (p1) winner = p1;
                  else if (p2) winner = p2;
              }

              let id = matchIdCounter++;
              initialMatches[id] = {
                  id, category,
                  type: roundCount === 1 ? 'Finale' : (roundCount === 2 ? 'Halbfinale' : (roundCount === 4 ? 'Viertelfinale' : 'Achtelfinale')),
                  name: roundCount === 1 ? 'Finale' : `Spiel ${i+1}`,
                  stage: roundCount === 1 ? 'final' : 'ko',
                  koRound: roundCount,
                  matchIndex: i,
                  player1: p1 || 'Freilos', player2: p2 || 'Freilos',
                  originalPlayer1: p1 || 'Freilos', originalPlayer2: p2 || 'Freilos',
                  winner: winner,
                  score: isBye ? 'Freilos' : '',
                  isFinal: roundCount === 1,
                  isSemi: roundCount === 2,
                  conflictPlayers: isBye ? [] : [...extractPlayers(p1), ...extractPlayers(p2)]
              };
          }

          let currentRoundSize = roundCount / 2;
          while (currentRoundSize >= 1) {
              for (let i = 0; i < currentRoundSize; i++) {
                  let id = matchIdCounter++;
                  initialMatches[id] = {
                      id, category,
                      type: currentRoundSize === 1 ? 'Finale' : (currentRoundSize === 2 ? 'Halbfinale' : 'Viertelfinale'),
                      name: currentRoundSize === 1 ? 'Finale' : `Spiel ${i+1}`,
                      stage: currentRoundSize === 1 ? 'final' : 'ko',
                      koRound: currentRoundSize,
                      matchIndex: i,
                      player1: `Sieger ${getRoundName(currentRoundSize*2)} ${i*2+1}`, player2: `Sieger ${getRoundName(currentRoundSize*2)} ${i*2+2}`,
                      originalPlayer1: `Sieger ${getRoundName(currentRoundSize*2)} ${i*2+1}`, originalPlayer2: `Sieger ${getRoundName(currentRoundSize*2)} ${i*2+2}`,
                      winner: null,
                      score: '',
                      isFinal: currentRoundSize === 1,
                      isSemi: currentRoundSize === 2,
                      conflictPlayers: []
                  };
              }
              currentRoundSize /= 2;
          }
          return { catStructure, initialMatches, nextId: matchIdCounter };
      }

      let customGroupCount = getGroupCount(category);
      let numGroups = 1;
      
      if (customGroupCount && customGroupCount !== 'auto') {
          numGroups = parseInt(customGroupCount, 10);
      } else {
          if (category.toLowerCase().includes("kinder") || count <= 4) numGroups = 1;
          else numGroups = 2;
      }
      
      numGroups = Math.max(1, Math.min(numGroups, Math.floor(count / 2) || 1));

      catStructure.type = mode === 'group_only' ? 'group-only' : 'standard';
      
      let groupNames = [];
      if (numGroups === 1) {
          groupNames = ['Gruppe 1'];
      } else {
          groupNames = Array.from({length: numGroups}, (_, i) => `Gruppe ${String.fromCharCode(65 + i)}`); 
      }

      groupNames.forEach(gn => catStructure.groups[gn] = []);
      
      players.forEach((p, i) => {
          catStructure.groups[groupNames[i % numGroups]].push(p);
      });

      let groupMatches = [];
      groupNames.forEach(gn => {
          const gPlayers = catStructure.groups[gn];
          for (let i = 0; i < gPlayers.length; i++) {
              for (let j = i + 1; j < gPlayers.length; j++) {
                  groupMatches.push({ player1: gPlayers[i], player2: gPlayers[j], groupName: gn });
              }
          }
      });

      groupMatches.forEach((m, idx) => {
          let id = matchIdCounter++;
          initialMatches[id] = {
              id, category, type: 'Gruppe', name: `Spiel ${idx+1}`, stage: 'group',
              player1: m.player1, player2: m.player2, groupName: m.groupName,
              originalPlayer1: m.player1, originalPlayer2: m.player2,
              winner: null, score: '', isFinal: false, isSemi: false,
              conflictPlayers: [...extractPlayers(m.player1), ...extractPlayers(m.player2)]
          };
      });

      if (mode !== 'group_only') {
          let advancers = [];
          if (numGroups === 1) {
              let numAdvancing = count >= 4 ? 4 : 2;
              for(let i=1; i<=numAdvancing; i++) advancers.push(`${i}. Gruppe 1`);
          } else {
              for(let i=0; i<numGroups; i++) advancers.push(`1. ${groupNames[i]}`);
              for(let i=0; i<numGroups; i++) advancers.push(`2. ${groupNames[i]}`);
          }

          let bracketSize = Math.max(2, Math.pow(2, Math.ceil(Math.log2(advancers.length))));
          while(advancers.length < bracketSize) advancers.push('Freilos');

          let seeds = getKnockoutSeeds(bracketSize);
          let roundCount = bracketSize / 2;

          for (let i = 0; i < roundCount; i++) {
              let p1 = advancers[seeds[i * 2]];
              let p2 = advancers[seeds[i * 2 + 1]];
              
              let isBye = (p1 === 'Freilos' || p2 === 'Freilos');
              let winner = null;
              if (isBye) {
                  if (p1 !== 'Freilos') winner = p1;
                  else if (p2 !== 'Freilos') winner = p2;
              }

              let id = matchIdCounter++;
              initialMatches[id] = {
                  id, category,
                  type: roundCount === 1 ? 'Finale' : (roundCount === 2 ? 'Halbfinale' : (roundCount === 4 ? 'Viertelfinale' : 'Achtelfinale')),
                  name: roundCount === 1 ? 'Finale' : `Spiel ${i+1}`,
                  stage: roundCount === 1 ? 'final' : 'ko',
                  koRound: roundCount,
                  matchIndex: i,
                  player1: p1, player2: p2,
                  originalPlayer1: p1, originalPlayer2: p2,
                  winner: winner,
                  score: isBye ? 'Freilos' : '',
                  isFinal: roundCount === 1,
                  isSemi: roundCount === 2,
                  conflictPlayers: isBye ? [] : [...extractPlayers(p1), ...extractPlayers(p2)]
              };
          }

          let currentRoundSize = roundCount / 2;
          while (currentRoundSize >= 1) {
              for (let i = 0; i < currentRoundSize; i++) {
                  let id = matchIdCounter++;
                  initialMatches[id] = {
                      id, category,
                      type: currentRoundSize === 1 ? 'Finale' : (currentRoundSize === 2 ? 'Halbfinale' : 'Viertelfinale'),
                      name: currentRoundSize === 1 ? 'Finale' : `Spiel ${i+1}`,
                      stage: currentRoundSize === 1 ? 'final' : 'ko',
                      koRound: currentRoundSize,
                      matchIndex: i,
                      player1: `Sieger ${getRoundName(currentRoundSize*2)} ${i*2+1}`, player2: `Sieger ${getRoundName(currentRoundSize*2)} ${i*2+2}`,
                      originalPlayer1: `Sieger ${getRoundName(currentRoundSize*2)} ${i*2+1}`, originalPlayer2: `Sieger ${getRoundName(currentRoundSize*2)} ${i*2+2}`,
                      winner: null,
                      score: '',
                      isFinal: currentRoundSize === 1,
                      isSemi: currentRoundSize === 2,
                      conflictPlayers: []
                  };
              }
              currentRoundSize /= 2;
          }
      }

      return { catStructure, initialMatches, nextId: matchIdCounter };
  };

  const generateSchedule = () => {
    setIsGenerating(true);
    
    setTimeout(() => {
      let finalStructures = {};
      let finalMatches = {};
      let matchIdCounter = 1;

      const catsWithPlayers = categories.map(cat => {
          const raw = getParticipantsList(cat);
          if(raw.length < 2) return { cat, data: null };
          let parsed = raw.map(line => {
              const parts = line.split(',');
              return { name: parts[0].trim(), strength: parts.length > 1 ? parseFloat(parts[1].trim()) : 99 };
          }).sort((a, b) => a.strength - b.strength);
          return { cat, data: parsed };
      }).filter(c => c.data !== null);

      catsWithPlayers.forEach(c => {
          const userMode = categoryModes[c.cat] || 'standard';
          const mode = userMode === 'ko_only' ? 'knockout' : userMode;
          const res = generateCategory(c.cat, c.data, mode, matchIdCounter);
          matchIdCounter = res.nextId;
          finalStructures[c.cat] = res.catStructure;
          finalMatches = { ...finalMatches, ...res.initialMatches };
      });

      const finalSlots = buildDynamicSchedule(finalMatches, null, numCourts, startTime, matchDuration, breakDuration, finalDuration, grandFinals, scheduleAllFinalsAtEnd, kinderCategories, kinderCourts, kinderShortFinals);

      setTournamentStructures(finalStructures);
      setMatchData(finalMatches);
      setTimeSlots(finalSlots);
      setIsGenerating(false);
      setActiveTab('schedule');
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-teal-200 w-full">
      <header className="bg-teal-700 text-white shadow-md print:hidden w-full">
        <div className="w-full px-4 md:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 text-yellow-400" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">TC Wannweil</h1>
              <p className="text-teal-100 text-sm font-medium">Vereinsmeisterschaft - Turnierplaner</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="hidden md:flex items-center gap-2 text-xs font-medium text-teal-200 bg-teal-800/50 px-3 py-1.5 rounded-full border border-teal-600/50">
               {isSavingToCloud ? <Cloud className="animate-pulse" size={14} /> : <Cloud size={14} />}
               {isSavingToCloud ? 'Speichert...' : 'Auto-Save Aktiv'}
             </div>
             <button onClick={() => setViewMode('monitor')} className="flex items-center gap-2 bg-teal-800 hover:bg-teal-900 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-teal-600">
                <Monitor size={18} /> Monitor-Ansicht
             </button>
             <button onClick={() => setLoginRole(null)} className="flex items-center gap-2 bg-teal-800 hover:bg-teal-900 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-teal-600">
                <LogIn size={18} className="rotate-180" /> Logout
             </button>
          </div>
        </div>
      </header>

      <main className="w-full px-4 md:px-8 py-8">
        <div className="flex flex-wrap gap-2 mb-8 border-b border-slate-200 pb-2 print:hidden w-full">
          <TabButton active={activeTab === 'applications'} onClick={() => setActiveTab('applications')} icon={<Inbox size={18} />} label="Anmeldungen" />
          <TabButton active={activeTab === 'participants'} onClick={() => setActiveTab('participants')} icon={<Users size={18} />} label="Meldelisten" />
          <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={18} />} label="Einstellungen" />
          <TabButton active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} icon={<Calendar size={18} />} label="Spielplan" disabled={!timeSlots && !isGenerating} highlight={timeSlots !== null && activeTab === 'settings'} />
          <TabButton active={activeTab === 'brackets'} onClick={() => setActiveTab('brackets')} icon={<Grid size={18} />} label="Tabellen & Turnierbaum" disabled={!timeSlots && !isGenerating} />
        </div>

        {activeTab === 'applications' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 w-full">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6 w-full">
              <div className="flex flex-col md:flex-row justify-between md:items-start mb-6 gap-4">
                <div>
                  <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                    <Inbox className="text-teal-600" /> E-Mail / Formular Anmeldungen
                  </h2>
                  <div className="text-slate-600 text-sm bg-blue-50 p-3 rounded-lg border-l-4 border-blue-500 w-full">
                    <p className="mb-1">Kopieren Sie den Text aus den E-Mail-Anmeldungen in das Feld unten. Das System analysiert den Text und ordnet die Spieler automatisch zu.</p>
                    <p>Wenn ein Spieler erneut eingefügt wird (gleicher Name), werden seine neuen Kategorien und Partner hinzugefügt.</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <input type="file" accept=".json" ref={appFileInputRef} onChange={handleImportApplications} className="hidden" />
                  <button onClick={() => appFileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 rounded-lg text-sm font-medium transition-colors border border-slate-200 hover:border-teal-200" title="Anmeldungen importieren (.json)">
                    <Upload size={16} /> Importieren
                  </button>
                  <button onClick={handleExportApplications} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 rounded-lg text-sm font-medium transition-colors border border-slate-200 hover:border-teal-200" title="Anmeldungen exportieren (.json)">
                    <Download size={16} /> Exportieren
                  </button>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-8 w-full">
                 <div className="w-full md:w-1/3 flex flex-col gap-3">
                    <label className="text-sm font-bold text-slate-700">Neue Anmeldung einfügen:</label>
                    <textarea 
                        className="w-full h-72 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm font-mono resize-none bg-slate-50"
                        placeholder="Es gibt eine neue Anmeldung:&#10;SpielerIn&#10;Sylvia Van Buijtenen&#10;..."
                        value={rawAppInput}
                        onChange={(e) => setRawAppInput(e.target.value)}
                    />
                    <button onClick={handleParseRawInput} disabled={!rawAppInput.trim()} className="bg-teal-600 hover:bg-teal-500 text-white py-3 rounded-lg font-bold transition-colors flex justify-center items-center gap-2 disabled:opacity-50">
                        <Plus size={18} /> Anmeldung verarbeiten
                    </button>
                 </div>
                 
                 <div className="w-full md:w-2/3 flex flex-col gap-3">
                    <div className="flex justify-between items-end mb-1">
                        <label className="text-sm font-bold text-slate-700">Erfasste Spieler ({Object.keys(applications).length})</label>
                        <button onClick={transferToParticipants} disabled={Object.keys(applications).length === 0} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 disabled:opacity-50 shadow-sm">
                            <ArrowRight size={16} /> Auf Meldelisten übertragen
                        </button>
                    </div>
                    <div className="border border-slate-200 rounded-lg overflow-y-auto max-h-[350px] shadow-sm">
                       <table className="w-full text-left text-sm">
                          <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                             <tr>
                                <th className="p-3 font-bold text-slate-700">Name</th>
                                <th className="p-3 font-bold text-slate-700">Kontakt</th>
                                <th className="p-3 font-bold text-slate-700">Kategorien & Partner</th>
                                <th className="p-3 font-bold text-slate-700 text-right">Aktion</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                             {Object.values(applications).map((app, idx) => (
                                 <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                     <td className="p-3 font-bold text-slate-800">{app.name}</td>
                                     <td className="p-3 text-slate-500 text-xs flex flex-col gap-0.5">
                                        {app.mail && <span>{app.mail}</span>}
                                        {app.tel && <span>{app.tel}</span>}
                                     </td>
                                     <td className="p-3 text-slate-700">
                                        <div className="flex flex-wrap gap-1.5">
                                            {Object.entries(app.entries || {}).map(([cat, data], i) => (
                                                <span key={i} className="bg-teal-50 text-teal-800 text-xs px-2.5 py-1 rounded-md border border-teal-100 flex items-center gap-1 font-medium">
                                                    {cat}
                                                    {data.partner && <span className="text-teal-600 font-bold italic">(& {data.partner})</span>}
                                                </span>
                                            ))}
                                        </div>
                                     </td>
                                     <td className="p-3 text-right">
                                         <button onClick={() => {
                                             setApplications(prev => {
                                                 const updated = {...prev};
                                                 delete updated[app.name];
                                                 return updated;
                                             })
                                         }} className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100" title="Eintrag löschen">
                                            <Trash2 size={18}/>
                                         </button>
                                     </td>
                                 </tr>
                             ))}
                             {Object.keys(applications).length === 0 && (
                                 <tr><td colSpan="4" className="p-8 text-center text-slate-400 font-medium">Es wurden noch keine Anmeldungen erfasst. Fügen Sie links Text ein.</td></tr>
                             )}
                          </tbody>
                       </table>
                    </div>
                    <div className="text-xs text-slate-500 text-right">
                        <span className="font-bold text-teal-600">Hinweis:</span> Beim Übertragen auf die Meldelisten werden Doppel-Partner automatisch zusammengefügt (z.B. Spieler / Partner) und bestehende LKs (Spielstärken) beibehalten.
                    </div>
                 </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'participants' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 w-full">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6 w-full">
              <div className="flex flex-col md:flex-row justify-between md:items-start mb-6 gap-4">
                <div>
                  <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                    <Users className="text-teal-600" /> Meldelisten
                  </h2>
                  <div className="text-slate-600 text-sm bg-blue-50 p-3 rounded-lg border-l-4 border-blue-500 w-full">
                    <p className="mb-1">Tragen Sie die Teilnehmer (ein Name pro Zeile) ein. Für Doppel trennen Sie Partner mit einem Schrägstrich (z.B. <code>Max / Moritz</code>).</p>
                    <p><b>Spielstärke (Seeding):</b> Um faire Gruppen zu bilden, können Sie hinter dem Namen ein Komma und einen Stärkewert angeben (z.B. <code>Max Mustermann, 3</code>).</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                {categories.map(cat => (
                  <div key={cat} className="flex flex-col">
                    <div className="flex justify-between items-start mb-2 min-h-[28px]">
                      {editingCategory === cat ? (
                        <div className="flex items-center gap-1 w-full mr-2 mt-0.5">
                           <input autoFocus value={editCategoryName} onChange={e => setEditCategoryName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEditedCategory(cat); if (e.key === 'Escape') setEditingCategory(null); }} className="text-sm font-semibold text-slate-700 border-b border-teal-500 outline-none w-full bg-transparent py-0.5 px-1" />
                           <button onClick={() => saveEditedCategory(cat)} className="text-teal-600 hover:bg-teal-50 p-1 rounded transition-colors"><Check size={14} /></button>
                           <button onClick={() => setEditingCategory(null)} className="text-slate-400 hover:bg-slate-100 p-1 rounded transition-colors"><X size={14} /></button>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-col gap-1.5 w-full overflow-hidden">
                            <label className="text-sm font-semibold text-slate-700 truncate pr-2" title={cat}>{cat}</label>
                            
                            <div className="flex flex-col gap-1 mb-1">
                                <div className="flex gap-3 items-center">
                                    <label className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer hover:text-slate-700 transition-colors" title="Finale als 'Grand Final' am Ende spielen">
                                        <input type="checkbox" checked={grandFinals.includes(cat)} onChange={() => toggleGrandFinal(cat)} disabled={getMode(cat) === 'group_only'} className="w-3 h-3 text-amber-500 rounded border-slate-300 focus:ring-amber-500 cursor-pointer shrink-0 disabled:opacity-30" />
                                        <span className={getMode(cat) === 'group_only' ? 'opacity-50' : ''}>Grand Final</span>
                                    </label>

                                    <label className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer hover:text-slate-700 transition-colors" title="Als Kinder-Kategorie markieren (Bevorzugt früh & erweiterte Einstellungen)">
                                        <input type="checkbox" checked={kinderCategories.includes(cat)} onChange={() => toggleKinderCategory(cat)} className="w-3 h-3 text-pink-500 rounded border-slate-300 focus:ring-pink-500 cursor-pointer shrink-0" />
                                        <span>Kinder</span>
                                    </label>
                                </div>
                                
                                {kinderCategories.includes(cat) && (
                                    <div className="flex flex-col gap-1.5 mt-1 ml-4 border-l-2 border-pink-200 pl-2 py-0.5">
                                        <div className="flex items-center justify-between bg-white/60 p-1.5 rounded border border-slate-100">
                                            <span className="text-[10px] text-slate-500 font-medium">Fester Platz:</span>
                                            <select
                                                value={kinderCourts[cat] ?? 0}
                                                onChange={(e) => setKinderCourt(cat, parseInt(e.target.value))}
                                                className="text-[10px] p-0.5 border border-slate-200 rounded text-slate-700 bg-white focus:ring-1 focus:ring-pink-500 outline-none cursor-pointer w-20"
                                            >
                                                {Array.from({length: numCourts}).map((_, i) => (
                                                    <option key={i} value={i}>Platz {i+1}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <label className="flex items-start gap-1.5 text-[10px] text-slate-500 cursor-pointer hover:text-slate-800 transition-colors bg-white/60 p-1.5 rounded border border-slate-100">
                                            <input
                                                type="checkbox"
                                                checked={kinderShortFinals[cat] || false}
                                                onChange={() => toggleKinderShortFinal(cat)}
                                                className="w-3 h-3 text-pink-500 rounded border-slate-300 focus:ring-pink-500 cursor-pointer shrink-0 mt-0.5"
                                            />
                                            <span className="leading-tight font-medium">Finale mit Vorrunden-Zeit & direkt im Anschluss</span>
                                        </label>
                                    </div>
                                )}

                                <div className="flex flex-col gap-1.5 bg-slate-50/70 p-2 rounded border border-slate-100 mt-1">
                                    <label className="flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer hover:text-slate-900 transition-colors">
                                        <input type="radio" name={`mode-${cat}`} checked={getMode(cat) === 'standard'} onChange={() => setCategoryMode(cat, 'standard')} className="w-3 h-3 text-teal-600 focus:ring-teal-500 cursor-pointer" />
                                        Gruppenphase + K.O.
                                    </label>
                                    <label className="flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer hover:text-slate-900 transition-colors">
                                        <input type="radio" name={`mode-${cat}`} checked={getMode(cat) === 'group_only'} onChange={() => setCategoryMode(cat, 'group_only')} className="w-3 h-3 text-teal-600 focus:ring-teal-500 cursor-pointer" />
                                        Nur Gruppenphase
                                    </label>
                                    <label className="flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer hover:text-slate-900 transition-colors">
                                        <input type="radio" name={`mode-${cat}`} checked={getMode(cat) === 'ko_only'} onChange={() => setCategoryMode(cat, 'ko_only')} className="w-3 h-3 text-teal-600 focus:ring-teal-500 cursor-pointer" />
                                        Nur K.O.
                                    </label>
                                </div>
                                
                                {getMode(cat) !== 'ko_only' && (
                                    <div className="flex items-center justify-between mt-1 bg-white/60 p-1.5 rounded border border-slate-100">
                                        <span className="text-[10px] text-slate-500 font-medium">Anzahl Gruppen:</span>
                                        <select
                                            value={getGroupCount(cat)}
                                            onChange={(e) => setGroupCount(cat, e.target.value)}
                                            className="text-[10px] p-0.5 border border-slate-200 rounded text-slate-700 bg-white focus:ring-1 focus:ring-teal-500 outline-none cursor-pointer w-20"
                                        >
                                            <option value="auto">Auto</option>
                                            <option value="1">1 Gruppe</option>
                                            <option value="2">2 Gruppen</option>
                                            <option value="3">3 Gruppen</option>
                                            <option value="4">4 Gruppen</option>
                                            <option value="5">5 Gruppen</option>
                                            <option value="6">6 Gruppen</option>
                                            <option value="8">8 Gruppen</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-1 shrink-0 mt-0.5">
                            <button onClick={() => addRandomPlayer(cat)} className="text-[10px] bg-teal-50 text-teal-600 hover:bg-teal-100 border border-teal-200 px-2 py-1 rounded flex items-center gap-1 transition-colors" title="Zufälligen Spieler generieren"><Dices size={12} /> Zufall</button>
                            <button onClick={() => { setEditingCategory(cat); setEditCategoryName(cat); }} className="text-[10px] bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 px-2 py-1 rounded flex items-center transition-colors" title="Umbenennen"><Edit2 size={12} /></button>
                            <button onClick={() => handleRemoveCategory(cat)} className="text-[10px] bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-2 py-1 rounded flex items-center transition-colors" title="Löschen"><Trash2 size={12} /></button>
                          </div>
                        </>
                      )}
                    </div>
                    <textarea className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all text-sm resize-none" placeholder="Name, 5&#10;Name 2, 12&#10;..." value={participants[cat] || ''} onChange={(e) => handleParticipantChange(cat, e.target.value)} />
                    <div className="text-xs text-slate-500 mt-1 text-right">
                      {getParticipantsList(cat).length} {getParticipantsList(cat).length === 1 ? 'Meldung' : 'Meldungen'}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 w-full">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">Weitere Kategorie hinzufügen</h3>
                  <div className="flex items-center gap-2 max-w-sm">
                      <input type="text" className="flex-1 p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500" placeholder="Name (z.B. Junioren U18)" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()} />
                      <button onClick={handleAddCategory} disabled={!newCategoryName.trim()} className="bg-slate-200 hover:bg-teal-600 hover:text-white text-slate-700 px-3 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1"><Plus size={16}/> Hinzufügen</button>
                  </div>
              </div>
            </div>

            <div className="flex justify-end w-full">
              <button onClick={() => setActiveTab('settings')} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2">
                Weiter zu den Einstellungen <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 w-full">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 w-full">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Settings className="text-teal-600" /> Turniereinstellungen
              </h2>
              
              <div className="space-y-6 w-full">
                <div className="bg-slate-100 p-4 rounded-lg flex flex-col md:flex-row gap-4 items-start md:items-center w-full">
                    <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer shrink-0">
                        <input type="checkbox" checked={scheduleAllFinalsAtEnd} onChange={e => setScheduleAllFinalsAtEnd(e.target.checked)} className="w-5 h-5 text-teal-600 rounded border-slate-300 focus:ring-teal-500 cursor-pointer" />
                        Alle Finals am Ende spielen
                    </label>
                    <div className="text-sm text-slate-500 md:ml-4">Plant alle Endspiele gesammelt ganz am Ende des Turniers ein. (Ausnahme: Kinder-Finals mit aktiver "Vorrunden-Zeit" Einstellung).</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Turnierbeginn</label>
                    <input type="time" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Anzahl Plätze</label>
                    <input type="number" min="1" max="20" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" value={numCourts} onChange={(e) => setNumCourts(parseInt(e.target.value) || 1)} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Spielzeit Vorrunde (Min)</label>
                    <input type="number" min="10" max="120" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" value={matchDuration} onChange={(e) => setMatchDuration(parseInt(e.target.value) || 30)} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Pausenzeit (Min)</label>
                    <input type="number" min="0" max="60" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" value={breakDuration} onChange={(e) => setBreakDuration(parseInt(e.target.value) || 0)} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Spielzeit Finale (Min)</label>
                    <input type="number" min="30" max="180" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" value={finalDuration} onChange={(e) => setFinalDuration(parseInt(e.target.value) || 90)} />
                  </div>
                </div>
              </div>

              <div className="mt-8 border-t border-slate-100 pt-6 flex justify-between w-full">
                <button onClick={() => setActiveTab('participants')} className="text-slate-600 hover:text-slate-900 px-4 py-2 font-medium transition-colors">Zurück</button>
                <button onClick={generateSchedule} disabled={isGenerating} className="bg-teal-600 hover:bg-teal-500 text-white px-8 py-3 rounded-lg font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-2 disabled:opacity-70">
                  {isGenerating ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Berechne...</> : <><Play size={18} fill="currentColor" /> Spielplan Generieren</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'schedule' && timeSlots && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 w-full">
            <div className="flex justify-between items-center mb-6 print:hidden w-full">
               <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                 <Calendar className="text-teal-600" /> Offizieller Spielplan
               </h2>
               <div className="flex gap-2">
                   <button onClick={() => setViewMode('monitor')} className="bg-teal-100 hover:bg-teal-200 text-teal-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                     <Monitor size={16} /> Monitor
                   </button>
                   <button onClick={() => window.print()} className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors hidden md:block">
                     Plan Drucken
                   </button>
               </div>
            </div>

            <div className="hidden print:block w-full">
                <h2 className="text-2xl font-bold text-slate-800 mb-4 border-b border-slate-300 pb-2">Spielplan - Vereinsmeisterschaft</h2>
                <table className="w-full text-left text-sm border-collapse border border-slate-300">
                    <thead>
                        <tr className="bg-slate-200 print:bg-slate-200">
                            <th className="border border-slate-300 p-2 font-bold">Zeit</th>
                            <th className="border border-slate-300 p-2 font-bold text-center">Platz</th>
                            <th className="border border-slate-300 p-2 font-bold">Kategorie</th>
                            <th className="border border-slate-300 p-2 font-bold">Begegnung</th>
                            <th className="border border-slate-300 p-2 font-bold">Ergebnis</th>
                        </tr>
                    </thead>
                    <tbody>
                        {timeSlots.map(slot => (
                            slot.matchIds.map(id => {
                                const match = matchData[id];
                                if (!match) return null;
                                return (
                                    <tr key={id} className="break-inside-avoid">
                                        <td className="border border-slate-300 p-2 whitespace-nowrap">{slot.time || ''} - {slot.endTime || ''}</td>
                                        <td className="border border-slate-300 p-2 text-center font-semibold">{match.court || 1}</td>
                                        <td className="border border-slate-300 p-2 font-medium">{match.category || ''} <span className="text-slate-500 font-normal">({match.type || ''})</span></td>
                                        <td className="border border-slate-300 p-2 break-words">{match.player1 || ''} <span className="text-slate-400 italic px-2">vs</span> {match.player2 || ''}</td>
                                        <td className="border border-slate-300 p-2 font-bold text-center w-24">{match.score || ''}</td>
                                    </tr>
                                );
                            })
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="space-y-6 pb-20 print:hidden w-full">
              {timeSlots.map((slot, index) => (
                <div key={index} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
                  <div className={`px-4 py-3 border-b flex items-center justify-between ${slot.slotType === 'final' ? 'bg-amber-100 border-amber-200' : 'bg-slate-100 border-slate-200'}`}>
                    <div className="flex items-center gap-2 font-bold text-lg text-slate-800">
                      <Clock size={20} className={slot.slotType === 'final' ? 'text-amber-600' : 'text-slate-500'} />
                      {slot.time || ''} - {slot.endTime || ''} Uhr
                    </div>
                    {slot.slotType === 'final' && (
                      <span className="bg-amber-500 text-white text-xs px-2 py-1 rounded font-bold uppercase tracking-wider flex items-center gap-1"><Trophy size={12} /> Finals</span>
                    )}
                  </div>

                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
                    {(slot.matchIds || []).map(id => {
                      const match = matchData[id];
                      if (!match) return null;
                      return <MatchCard key={id} match={match} onSaveResult={handleUpdateResult} onManualTimeChange={handleManualTimeChange} />;
                    })}
                  </div>
                </div>
              ))}

              {timeSlots.length === 0 && (
                <div className="text-center py-12 text-slate-500 w-full">
                  <Calendar size={48} className="mx-auto text-slate-300 mb-4" />
                  <p>Es konnten keine Spiele generiert werden.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'brackets' && tournamentStructures && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 w-full">
            <div className="flex justify-between items-center mb-6 print:hidden w-full">
               <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Grid className="text-teal-600" /> Tabellen & Turnierbaum</h2>
               <button onClick={() => window.print()} className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors hidden md:block print:hidden">Drucken</button>
            </div>

            <BracketsView categories={categories} tournamentStructures={tournamentStructures} matchData={matchData} />
          </div>
        )}
      </main>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, disabled, highlight }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${active ? 'bg-teal-600 text-white shadow-md' : 'bg-transparent text-slate-600 hover:bg-slate-100'} ${disabled ? 'opacity-50 cursor-not-allowed hover:bg-transparent' : ''} ${highlight && !active ? 'ring-2 ring-teal-500 ring-offset-1 text-teal-700 bg-teal-50' : ''}`}>
      {icon} {label}
    </button>
  );
}

function MatchCard({ match, onSaveResult, onManualTimeChange }) {
  const [isEditing, setIsEditing] = useState(false);
  const [scoreInput, setScoreInput] = useState(match?.score || '');
  const [winnerInput, setWinnerInput] = useState(match?.winner || '');

  useEffect(() => {
     setScoreInput(match?.score || '');
     setWinnerInput(match?.winner || '');
  }, [match?.score, match?.winner]);

  if (!match) return null;
  const isPlaceholder = (match.player1 || '').includes('Gruppe') || (match.player1 || '').includes('Sieger') || (match.player1 || '').includes('Platz');

  const handleScoreChange = (e) => {
      const val = e.target.value;
      setScoreInput(val);
      
      if (!match.isFinal) {
          const parsed = val.match(/^(\d+)\s*:\s*(\d+)$/);
          if (parsed) {
              const s1 = parseInt(parsed[1], 10);
              const s2 = parseInt(parsed[2], 10);
              if (s1 > s2) setWinnerInput(match.player1);
              else if (s2 > s1) setWinnerInput(match.player2);
              else setWinnerInput('');
          } else {
              setWinnerInput('');
          }
      }
  };

  const handleSave = () => {
    onSaveResult(match.id, scoreInput, winnerInput);
    setIsEditing(false);
  };

  if (match.score === 'Freilos') return null;

  return (
    <div className={`border rounded-lg p-3 relative flex flex-col h-full w-full ${match.isFinal ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 bg-white shadow-sm'}`}>
      <div className="text-xs font-semibold text-teal-600 mb-1 flex justify-between items-center">
        <span className="break-words pr-2">{match.category || ''}</span>
        <span className="text-slate-400 font-normal whitespace-nowrap">Platz {match.court || 1}</span>
      </div>
      
      {!match.isFinal && <div className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-bold">{match.type || ''} {match.name && `- ${match.name}`}</div>}
      {match.isFinal && <div className="text-xs text-amber-600 mb-2 uppercase tracking-wide font-bold flex items-center gap-1"><Trophy size={12}/> {match.type || 'Finale'}</div>}

      <div className="flex flex-col gap-2 flex-grow">
        <div className={`font-medium text-sm flex items-start gap-2 ${match.winner === match.player1 ? 'text-teal-700 font-bold' : 'text-slate-700'}`}>
          <span className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-400 flex-shrink-0 mt-0.5">1</span>
          <span className="break-words">{match.player1 || ''}</span>
        </div>
        <div className="text-[10px] text-slate-300 text-center font-serif italic my-[-4px]">vs</div>
        <div className={`font-medium text-sm flex items-start gap-2 ${match.winner === match.player2 ? 'text-teal-700 font-bold' : 'text-slate-700'}`}>
          <span className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-400 flex-shrink-0 mt-0.5">2</span>
          <span className="break-words">{match.player2 || ''}</span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
        {!isPlaceholder ? (
          !isEditing && match.winner ? (
            <div className="flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-100">
              <div className="text-sm font-bold text-slate-800">{match.score || ''}</div>
              <button onClick={() => setIsEditing(true)} className="text-slate-400 hover:text-teal-600 transition-colors p-1" title="Ergebnis bearbeiten"><Edit2 size={14} /></button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input type="text" placeholder={match.isFinal ? "Sätze (z.B. 6:4, 6:2)" : "Ergebnis (z.B. 10:5)"} className="w-full text-xs p-2 border border-slate-200 rounded focus:ring-1 focus:ring-teal-500 outline-none" value={scoreInput} onChange={handleScoreChange} />
              
              {match.isFinal ? (
                 <div className="flex gap-1">
                    <button onClick={() => setWinnerInput(match.player1)} className={`flex-1 text-[10px] py-1.5 rounded border transition-colors px-1 ${winnerInput === match.player1 ? 'bg-amber-500 text-white border-amber-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>Sieg P1</button>
                    <button onClick={() => setWinnerInput(match.player2)} className={`flex-1 text-[10px] py-1.5 rounded border transition-colors px-1 ${winnerInput === match.player2 ? 'bg-amber-500 text-white border-amber-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>Sieg P2</button>
                    <button onClick={handleSave} disabled={!winnerInput} className="bg-slate-800 text-white px-2 rounded hover:bg-slate-700 disabled:opacity-50 flex items-center"><Check size={14} /></button>
                 </div>
              ) : (
                 <button onClick={handleSave} disabled={!winnerInput} className="w-full bg-slate-800 text-white text-xs py-2 rounded hover:bg-slate-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"><Check size={14} /> Speichern</button>
              )}
            </div>
          )
        ) : (
          <div className="text-[10px] text-center text-slate-400 font-medium bg-slate-50 py-1.5 rounded">
             {match.isFinal ? 'Finalisten noch offen' : 'Wartet auf Vorrunde'}
          </div>
        )}

        {match.isFinal && (
          <div className="mt-1 pt-2 border-t border-amber-200/50 flex justify-between items-center print:hidden">
             <span className="text-[10px] text-amber-700 font-semibold flex items-center gap-1"><Clock size={10} /> Startzeit:</span>
             <input type="time" value={match.manualTime || ''} onChange={(e) => onManualTimeChange(match.id, e.target.value || null)} className="text-xs px-1.5 py-0.5 border border-amber-300 rounded bg-amber-50 text-amber-900 outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
        )}
      </div>
    </div>
  );
}