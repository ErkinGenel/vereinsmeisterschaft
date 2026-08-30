import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Users, Settings, Trophy, Clock, AlertCircle, Play, ChevronRight, Grid, Dices, Edit2, Check, Download, Upload, Plus, Trash2, X } from 'lucide-react';

const DEFAULT_CATEGORIES = [
  "Herren-Einzel-U60",
  "Herren-Einzel-Ü60",
  "Herren-Doppel-U60",
  "Herren-Doppel-Ü60",
  "Damen-Einzel",
  "Damen-Doppel",
  "Doppel-Mix"
];

const FIRST_NAMES_M = ["Lukas", "Maximilian", "Tim", "Paul", "Leon", "Jonas", "Finn", "Elias", "Luis", "Julian", "Tom", "Felix"];
const FIRST_NAMES_F = ["Mia", "Emma", "Hannah", "Sofia", "Anna", "Lea", "Emilia", "Marie", "Lena", "Amelie", "Laura", "Sarah"];
const LAST_NAMES = ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann", "Schäfer", "Koch", "Bauer", "Richter", "Klein", "Wolf"];

const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Extrahiert Spielernamen sauber
const extractPlayers = (participantString) => {
  if (!participantString || participantString.includes('Gruppe') || participantString.includes('Sieger') || participantString.includes('Platz')) return [];
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
        const semis = catMatches.filter(m => m.stage === 'semi');
        const final = catMatches.find(m => m.stage === 'final' && (!m.koRound || m.koRound === 1));
        const count = structure.playerCount;

        const groupsDone = groupMatches.length > 0 && groupMatches.every(m => m.winner);
        
        const standings = {};
        if (structure.groups) {
            Object.keys(structure.groups).forEach(gName => {
                standings[gName] = calculateStandings(gName, structure, catMatches);
            });
        }

        if (structure.type === 'single-group-semis') {
            const s1 = semis.find(m => m.semiIndex === 1);
            const s2 = semis.find(m => m.semiIndex === 2);
            if (groupsDone && standings['Gruppe 1']?.length >= 4) {
                if (s1 && !s1.winner) { s1.player1 = standings['Gruppe 1'][0].name; s1.player2 = standings['Gruppe 1'][3].name; }
                if (s2 && !s2.winner) { s2.player1 = standings['Gruppe 1'][1].name; s2.player2 = standings['Gruppe 1'][2].name; }
            } else {
                if (s1 && !s1.winner) { s1.player1 = '1. Gruppe 1'; s1.player2 = '4. Gruppe 1'; }
                if (s2 && !s2.winner) { s2.player1 = '2. Gruppe 1'; s2.player2 = '3. Gruppe 1'; }
            }
        } else if (structure.type === 'two-groups-semis') {
            const s1 = semis.find(m => m.semiIndex === 1);
            const s2 = semis.find(m => m.semiIndex === 2);
            if (groupsDone && standings['Gruppe A']?.length >= 2 && standings['Gruppe B']?.length >= 2) {
                if (s1 && !s1.winner) { s1.player1 = standings['Gruppe A'][0].name; s1.player2 = standings['Gruppe B'][1].name; }
                if (s2 && !s2.winner) { s2.player1 = standings['Gruppe B'][0].name; s2.player2 = standings['Gruppe A'][1].name; }
            } else {
                if (s1 && !s1.winner) { s1.player1 = '1. Gruppe A'; s1.player2 = '2. Gruppe B'; }
                if (s2 && !s2.winner) { s2.player1 = '1. Gruppe B'; s2.player2 = '2. Gruppe A'; }
            }
        }

        if (final && structure.type !== 'knockout') {
              if (structure.type === 'round-robin-final') {
                  if (groupsDone && standings['Gruppe 1']?.length >= 2) {
                      if (!final.winner) { final.player1 = standings['Gruppe 1'][0].name; final.player2 = standings['Gruppe 1'][1].name; }
                  } else if (count > 2) {
                      if (!final.winner) { final.player1 = '1. Gruppe 1'; final.player2 = '2. Gruppe 1'; }
                  }
              } else if (semis.length === 2) {
                  const s1 = semis.find(m => m.semiIndex === 1);
                  const s2 = semis.find(m => m.semiIndex === 2);
                  if (s1?.winner && s2?.winner) {
                      if (!final.winner) { final.player1 = s1.winner; final.player2 = s2.winner; }
                  } else {
                      if (!final.winner) { final.player1 = 'Sieger HF 1'; final.player2 = 'Sieger HF 2'; }
                  }
              }
        }
    });

    // Knockout Propagierung
    const allKoMatches = Object.values(updated).filter(m => m.stage === 'ko' || (m.stage === 'final' && m.koRound === 1));
    allKoMatches.forEach(m => {
        if (m.winner && m.koRound > 1) {
            const nextRound = m.koRound / 2;
            const nextMatchIndex = Math.floor(m.matchIndex / 2);
            const nextMatch = allKoMatches.find(x => x.category === m.category && x.koRound === nextRound && x.matchIndex === nextMatchIndex);
            
            if (nextMatch && !nextMatch.winner) {
                if (m.matchIndex % 2 === 0) {
                    nextMatch.player1 = m.winner;
                } else {
                    nextMatch.player2 = m.winner;
                }
                nextMatch.conflictPlayers = [...extractPlayers(nextMatch.player1), ...extractPlayers(nextMatch.player2)];
            }
        }
    });

    Object.values(updated).forEach(m => {
        if(m.score !== 'Freilos') {
            m.conflictPlayers = [...extractPlayers(m.player1), ...extractPlayers(m.player2)];
        }
    });

    return updated;
};

const applyTimesToSlots = (slots, matches, startTime, matchDuration, breakDuration, finalDuration) => {
    const parseTime = (timeStr) => { const [h, m] = timeStr.split(':').map(Number); return h * 60 + m; };
    const formatTime = (mins) => {
        const h = Math.floor(mins / 60).toString().padStart(2, '0');
        const m = (mins % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    };

    let currentMins = parseTime(startTime);
    slots.forEach((slot, idx) => {
        slot.slotIndex = idx;
        slot.time = formatTime(currentMins);
        let isFinal = slot.matchIds.some(id => matches[id]?.stage === 'final');
        slot.slotType = isFinal ? 'final' : 'regular';
        let duration = isFinal ? finalDuration : matchDuration; 
        slot.endTime = formatTime(currentMins + duration);
        currentMins += duration + breakDuration; 
    });
    return slots;
};

const buildDynamicSchedule = (matches, currentSlots, numCourts, startTime, matchDuration, breakDuration, finalDuration, grandFinalCategories, scheduleAllFinalsAtEnd) => {
    let allMatches = Object.values(matches);
    let finishedIds = new Set(allMatches.filter(m => m.winner || m.score === 'Freilos').map(m => m.id));

    let lockedPlacement = {}; 
    if (currentSlots) {
        currentSlots.forEach((slot, idx) => {
            slot.matchIds.forEach(id => {
                if (finishedIds.has(id) && matches[id].score !== 'Freilos') {
                    lockedPlacement[id] = idx;
                }
            });
        });
    }

    let matchEndSlot = {};
    let slots = [];

    const getSlot = (idx) => {
        while (slots.length <= idx) slots.push({ matchIds: [], activePlayers: new Set() });
        return slots[idx];
    };

    Object.entries(lockedPlacement).forEach(([idStr, sIdx]) => {
        let id = parseInt(idStr);
        let slot = getSlot(sIdx);
        slot.matchIds.push(id);
        if (matches[id] && matches[id].score !== 'Freilos') {
            matches[id].conflictPlayers.forEach(p => slot.activePlayers.add(p));
        }
        matchEndSlot[id] = sIdx + 1;
    });

    let pendingPhase1 = allMatches.filter(m => !finishedIds.has(m.id) && !(m.stage === 'final' && (scheduleAllFinalsAtEnd || grandFinalCategories.includes(m.category))));
    let currentSlotIdx = 0;

    while (pendingPhase1.length > 0) {
        let slot = getSlot(currentSlotIdx);
        let availableCourts = numCourts - slot.matchIds.length;

        if (availableCourts > 0) {
            let readyMatches = pendingPhase1.filter(m => {
                if (m.stage === 'group') return true;
                if (m.stage === 'semi') {
                    const catGroups = allMatches.filter(x => x.category === m.category && x.stage === 'group');
                    return catGroups.every(g => matchEndSlot[g.id] !== undefined && matchEndSlot[g.id] <= currentSlotIdx);
                }
                if (m.stage === 'ko') {
                    const prevRound = m.koRound * 2;
                    const prevMatches = allMatches.filter(x => x.category === m.category && x.koRound === prevRound);
                    if (prevMatches.length > 0) {
                        return prevMatches.every(pm => (pm.score === 'Freilos' || (matchEndSlot[pm.id] !== undefined && matchEndSlot[pm.id] <= currentSlotIdx)));
                    }
                    return true;
                }
                if (m.stage === 'final') {
                    const catSemis = allMatches.filter(x => x.category === m.category && (x.stage === 'semi' || x.koRound === 2));
                    if (catSemis.length > 0) {
                        return catSemis.every(s => (s.score === 'Freilos' || (matchEndSlot[s.id] !== undefined && matchEndSlot[s.id] <= currentSlotIdx)));
                    } else {
                        const catGroups = allMatches.filter(x => x.category === m.category && x.stage === 'group');
                        return catGroups.every(g => matchEndSlot[g.id] !== undefined && matchEndSlot[g.id] <= currentSlotIdx);
                    }
                }
                return false;
            });

            for (let m of readyMatches) {
                if (availableCourts === 0) break;
                if (!m.conflictPlayers.some(p => slot.activePlayers.has(p))) {
                    slot.matchIds.push(m.id);
                    m.conflictPlayers.forEach(p => slot.activePlayers.add(p));
                    matchEndSlot[m.id] = currentSlotIdx + 1;
                    pendingPhase1 = pendingPhase1.filter(x => x.id !== m.id);
                    availableCourts--;
                }
            }
        }
        currentSlotIdx++;
        if (currentSlotIdx > 200) break;
    }

    let phase2StartIdx = 0;
    allMatches.forEach(m => {
        if (!(m.stage === 'final' && (scheduleAllFinalsAtEnd || grandFinalCategories.includes(m.category))) && matchEndSlot[m.id]) {
            phase2StartIdx = Math.max(phase2StartIdx, matchEndSlot[m.id]);
        }
    });

    let pendingPhase2 = allMatches.filter(m => !finishedIds.has(m.id) && m.stage === 'final' && (scheduleAllFinalsAtEnd || grandFinalCategories.includes(m.category)));
    currentSlotIdx = phase2StartIdx;

    while (pendingPhase2.length > 0) {
        let slot = getSlot(currentSlotIdx);
        let availableCourts = numCourts - slot.matchIds.length;

        if (availableCourts > 0) {
            for (let m of pendingPhase2) {
                if (availableCourts === 0) break;
                if (!m.conflictPlayers.some(p => slot.activePlayers.has(p))) {
                    slot.matchIds.push(m.id);
                    m.conflictPlayers.forEach(p => slot.activePlayers.add(p));
                    matchEndSlot[m.id] = currentSlotIdx + 1;
                    pendingPhase2 = pendingPhase2.filter(x => x.id !== m.id);
                    availableCourts--;
                }
            }
        }
        currentSlotIdx++;
        if (currentSlotIdx > 300) break;
    }

    let finalSlots = slots.filter(s => s.matchIds.length > 0);
    
    finalSlots.forEach(slot => {
        slot.matchIds.forEach((id, idx) => {
            if(matches[id]) matches[id].court = idx + 1;
        });
    });

    return applyTimesToSlots(finalSlots, matches, startTime, matchDuration, breakDuration, finalDuration);
};


export default function App() {
  const [activeTab, setActiveTab] = useState('participants');
  
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  
  const [grandFinals, setGrandFinals] = useState(["Herren-Einzel-U60"]);

  // Settings
  const [startTime, setStartTime] = useState('09:00');
  const [numCourts, setNumCourts] = useState(4);
  const [matchDuration, setMatchDuration] = useState(30);
  const [breakDuration, setBreakDuration] = useState(10);
  const [finalDuration, setFinalDuration] = useState(90);
  
  const [compactMode, setCompactMode] = useState(false);
  const [maxTournamentHours, setMaxTournamentHours] = useState(9);
  const [scheduleAllFinalsAtEnd, setScheduleAllFinalsAtEnd] = useState(false);
  
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

  const handleSaveParticipants = () => {
    const dataToSave = { ...participants, __grandFinals: grandFinals, __settings: { compactMode, maxTournamentHours, scheduleAllFinalsAtEnd } };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToSave, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "teilnehmer_tc_wannweil.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleLoadParticipants = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const loadedData = JSON.parse(e.target.result);
        
        if (loadedData.__grandFinals) {
            setGrandFinals(loadedData.__grandFinals);
            delete loadedData.__grandFinals;
        }
        if (loadedData.__settings) {
            setCompactMode(loadedData.__settings.compactMode);
            setMaxTournamentHours(loadedData.__settings.maxTournamentHours);
            setScheduleAllFinalsAtEnd(loadedData.__settings.scheduleAllFinalsAtEnd || false);
            delete loadedData.__settings;
        }

        const loadedCategories = Object.keys(loadedData);
        setCategories(prev => Array.from(new Set([...prev, ...loadedCategories])));
        setParticipants(prev => ({ ...prev, ...loadedData }));
      } catch (error) {
        console.error("Fehler beim Laden der Datei:", error);
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleAddCategory = () => {
      const name = newCategoryName.trim();
      if (name && !categories.includes(name)) {
          setCategories(prev => [...prev, name]);
          setParticipants(prev => ({ ...prev, [name]: '' }));
          setNewCategoryName('');
          setTimeSlots(null);
          setTournamentStructures(null);
          setMatchData({});
      }
  };

  const handleRemoveCategory = (catToRemove) => {
      setCategories(prev => prev.filter(c => c !== catToRemove));
      setGrandFinals(prev => prev.filter(c => c !== catToRemove));
      setParticipants(prev => {
          const updated = { ...prev };
          delete updated[catToRemove];
          return updated;
      });
      setTimeSlots(null);
      setTournamentStructures(null);
      setMatchData({});
  };

  const saveEditedCategory = (oldCat) => {
      const newCat = editCategoryName.trim();
      if (!newCat || newCat === oldCat) {
          setEditingCategory(null);
          return;
      }
      if (categories.includes(newCat)) {
          setEditingCategory(null); 
          return;
      }

      setCategories(prev => prev.map(c => c === oldCat ? newCat : c));
      setGrandFinals(prev => prev.map(c => c === oldCat ? newCat : c));
      setParticipants(prev => {
          const updated = { ...prev };
          updated[newCat] = updated[oldCat];
          delete updated[oldCat];
          return updated;
      });
      
      setTimeSlots(null);
      setTournamentStructures(null);
      setMatchData({});
      setEditingCategory(null);
  };

  const toggleGrandFinal = (cat) => {
      setGrandFinals(prev => {
          if (prev.includes(cat)) return prev.filter(c => c !== cat);
          return [...prev, cat];
      });
      setTimeSlots(null);
      setTournamentStructures(null);
      setMatchData({});
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

  const handleUpdateResult = (matchId, score, winner) => {
    setMatchData(prevMatches => {
      let nextMatches = JSON.parse(JSON.stringify(prevMatches));
      nextMatches[matchId].score = score;
      nextMatches[matchId].winner = winner;
      
      nextMatches = processTournamentProgressPure(nextMatches, tournamentStructures, categories);
      setTimeSlots(prevSlots => buildDynamicSchedule(nextMatches, prevSlots, numCourts, startTime, matchDuration, breakDuration, finalDuration, grandFinals, scheduleAllFinalsAtEnd));
      
      return nextMatches;
    });
  };

  const generateCategory = (category, playersData, mode, startId) => {
      let matchIdCounter = startId;
      const count = playersData.length;
      const players = playersData.map(p => p.name);
      
      let initialMatches = {};
      let catStructure = { type: '', groups: {}, playerCount: count };

      if (mode === 'knockout' || count > 12) {
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
                  player1: p1 || 'Freilos',
                  player2: p2 || 'Freilos',
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
                      player1: `Sieger ${getRoundName(currentRoundSize*2)} ${i*2+1}`,
                      player2: `Sieger ${getRoundName(currentRoundSize*2)} ${i*2+2}`,
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

      // Standard Groups Logic
      let groupMatches = [];
      if (category.toLowerCase().includes("kinder")) {
          catStructure.type = 'group-only';
          catStructure.groups['Gruppe 1'] = players;
          for(let i=0; i<count; i++) {
              for(let j=i+1; j<count; j++) {
                  groupMatches.push({ player1: players[i], player2: players[j], groupName: 'Gruppe 1' });
              }
          }
      } else if (count <= 3) {
          catStructure.type = 'round-robin-final';
          catStructure.groups['Gruppe 1'] = players;
          for(let i=0; i<count; i++) {
              for(let j=i+1; j<count; j++) {
                  groupMatches.push({ player1: players[i], player2: players[j], groupName: 'Gruppe 1' });
              }
          }
      } else if (count === 4) {
          catStructure.type = 'single-group-semis';
          catStructure.groups['Gruppe 1'] = players;
          for(let i=0; i<count; i++) {
              for(let j=i+1; j<count; j++) {
                  groupMatches.push({ player1: players[i], player2: players[j], groupName: 'Gruppe 1' });
              }
          }
      } else {
          catStructure.type = 'two-groups-semis';
          const groupA = [];
          const groupB = [];
          players.forEach((p, i) => {
              if (i % 4 === 0 || i % 4 === 3) groupA.push(p);
              else groupB.push(p);
          });
          catStructure.groups['Gruppe A'] = groupA;
          catStructure.groups['Gruppe B'] = groupB;
          
          for(let i=0; i<groupA.length; i++) {
              for(let j=i+1; j<groupA.length; j++) groupMatches.push({ player1: groupA[i], player2: groupA[j], groupName: 'Gruppe A' });
          }
          for(let i=0; i<groupB.length; i++) {
              for(let j=i+1; j<groupB.length; j++) groupMatches.push({ player1: groupB[i], player2: groupB[j], groupName: 'Gruppe B' });
          }
      }

      groupMatches.forEach((m, idx) => {
          let id = matchIdCounter++;
          initialMatches[id] = {
              id, category, type: 'Gruppe', name: `Spiel ${idx+1}`, stage: 'group',
              player1: m.player1, player2: m.player2, groupName: m.groupName,
              winner: null, score: '', isFinal: false, isSemi: false,
              conflictPlayers: [...extractPlayers(m.player1), ...extractPlayers(m.player2)]
          };
      });

      if (count >= 4) {
          let s1 = matchIdCounter++;
          let s2 = matchIdCounter++;
          initialMatches[s1] = {
              id: s1, category, type: 'Halbfinale', name: 'HF 1', stage: 'semi', semiIndex: 1,
              player1: count === 4 ? '1. Gruppe 1' : '1. Gruppe A', 
              player2: count === 4 ? '4. Gruppe 1' : '2. Gruppe B', 
              winner: null, score: '', isFinal: false, isSemi: true, conflictPlayers: []
          };
          initialMatches[s2] = {
              id: s2, category, type: 'Halbfinale', name: 'HF 2', stage: 'semi', semiIndex: 2,
              player1: count === 4 ? '2. Gruppe 1' : '1. Gruppe B', 
              player2: count === 4 ? '3. Gruppe 1' : '2. Gruppe A', 
              winner: null, score: '', isFinal: false, isSemi: true, conflictPlayers: []
          };
      }

      if (catStructure.type !== 'group-only') {
          let fId = matchIdCounter++;
          let f_p1 = count >= 4 ? 'Sieger HF 1' : '1. Gruppe 1';
          let f_p2 = count >= 4 ? 'Sieger HF 2' : '2. Gruppe 1';
          if (count === 2) { f_p1 = players[0]; f_p2 = players[1]; }

          initialMatches[fId] = {
              id: fId, category, type: 'Finale', name: 'Finale', stage: 'final', koRound: 1,
              player1: f_p1, player2: f_p2, winner: null, score: '', isFinal: true, isSemi: false, 
              conflictPlayers: (count === 2 ? [...extractPlayers(f_p1), ...extractPlayers(f_p2)] : [])
          };
      }

      return { catStructure, initialMatches, nextId: matchIdCounter };
  };

  const generateSchedule = () => {
    setIsGenerating(true);
    
    setTimeout(() => {
      let finalStructures = {};
      let finalMatches = {};
      let matchIdCounter = 1;

      // 1. Prepare Player Data
      const catsWithPlayers = categories.map(cat => {
          const raw = getParticipantsList(cat);
          if(raw.length < 2) return { cat, data: null };
          let parsed = raw.map(line => {
              const parts = line.split(',');
              return { name: parts[0].trim(), strength: parts.length > 1 ? parseFloat(parts[1].trim()) : 99 };
          }).sort((a, b) => a.strength - b.strength);
          return { cat, data: parsed };
      }).filter(c => c.data !== null);

      // 2. Optimization Loop for Compact Mode
      let currentStructuresAndMatches = catsWithPlayers.map(c => {
          const res = generateCategory(c.cat, c.data, 'standard', 1); // IDs will be reassigned later
          return { cat: c.cat, data: c.data, mode: 'standard', matchesCount: Object.values(res.initialMatches).filter(m => m.score !== 'Freilos').length };
      });

      if (compactMode) {
          const maxAllowedMatches = Math.floor((maxTournamentHours * 60) / (matchDuration + breakDuration)) * numCourts;
          
          let activeMatchesCount = currentStructuresAndMatches.reduce((acc, c) => acc + c.matchesCount, 0);
          
          if (activeMatchesCount > maxAllowedMatches) {
              currentStructuresAndMatches.sort((a, b) => b.matchesCount - a.matchesCount); // Reduce largest first
              
              for (let i = 0; i < currentStructuresAndMatches.length; i++) {
                  if (activeMatchesCount <= maxAllowedMatches) break;
                  
                  const c = currentStructuresAndMatches[i];
                  if (c.data.length > 4) { // Only KO if makes sense
                      const koRes = generateCategory(c.cat, c.data, 'knockout', 1);
                      const koCount = Object.values(koRes.initialMatches).filter(m => m.score !== 'Freilos').length;
                      if (koCount < c.matchesCount) {
                          activeMatchesCount -= (c.matchesCount - koCount);
                          c.mode = 'knockout';
                          c.matchesCount = koCount;
                      }
                  }
              }
          }
      }

      // 3. Generate Final Identifiers
      currentStructuresAndMatches.forEach(c => {
          const res = generateCategory(c.cat, c.data, c.mode, matchIdCounter);
          matchIdCounter = res.nextId;
          finalStructures[c.cat] = res.catStructure;
          finalMatches = { ...finalMatches, ...res.initialMatches };
      });

      // Zuweisung über denselben optimalen Builder aufrufen
      const finalSlots = buildDynamicSchedule(finalMatches, null, numCourts, startTime, matchDuration, breakDuration, finalDuration, grandFinals, scheduleAllFinalsAtEnd);

      setTournamentStructures(finalStructures);
      setMatchData(finalMatches);
      setTimeSlots(finalSlots);
      setIsGenerating(false);
      setActiveTab('schedule');
    }, 800);
  };


  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-teal-200">
      <header className="bg-teal-700 text-white shadow-md print:hidden">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 text-yellow-400" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">TC Wannweil</h1>
              <p className="text-teal-100 text-sm font-medium">Vereinsmeisterschaft - Turnierplaner</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        
        <div className="flex flex-wrap gap-2 mb-8 border-b border-slate-200 pb-2 print:hidden">
          <TabButton 
            active={activeTab === 'participants'} 
            onClick={() => setActiveTab('participants')}
            icon={<Users size={18} />} label="Teilnehmer" 
          />
          <TabButton 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')}
            icon={<Settings size={18} />} label="Einstellungen" 
          />
          <TabButton 
            active={activeTab === 'schedule'} 
            onClick={() => setActiveTab('schedule')}
            icon={<Calendar size={18} />} label="Spielplan" 
            disabled={!timeSlots && !isGenerating}
            highlight={timeSlots !== null && activeTab === 'settings'}
          />
          <TabButton 
            active={activeTab === 'brackets'} 
            onClick={() => setActiveTab('brackets')}
            icon={<Grid size={18} />} label="Tabellen & Turnierbaum" 
            disabled={!timeSlots && !isGenerating}
          />
        </div>

        {/* Tab Content: Participants */}
        {activeTab === 'participants' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
              <div className="flex flex-col md:flex-row justify-between md:items-start mb-6 gap-4">
                <div>
                  <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                    <Users className="text-teal-600" /> Meldelisten
                  </h2>
                  <div className="text-slate-600 text-sm bg-blue-50 p-3 rounded-lg border-l-4 border-blue-500 max-w-3xl">
                    <p className="mb-1">Tragen Sie die Teilnehmer (ein Name pro Zeile) ein. Für Doppel trennen Sie Partner mit einem Schrägstrich (z.B. <code>Max / Moritz</code>).</p>
                    <p><b>Spielstärke (Seeding):</b> Um faire Gruppen zu bilden, können Sie hinter dem Namen ein Komma und einen Stärkewert (z.B. LK) angeben. Ein kleinerer Wert bedeutet eine höhere Stärke (z.B. <code>Max Mustermann, 3</code>). Die Gruppen werden dann automatisch ausbalanciert.</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  <input 
                    type="file" 
                    accept=".json" 
                    ref={fileInputRef} 
                    onChange={handleLoadParticipants} 
                    className="hidden" 
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 rounded-lg text-sm font-medium transition-colors border border-slate-200 hover:border-teal-200"
                    title="Teilnehmerliste laden (.json)"
                  >
                    <Upload size={16} /> Laden
                  </button>
                  <button 
                    onClick={handleSaveParticipants}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 rounded-lg text-sm font-medium transition-colors border border-slate-200 hover:border-teal-200"
                    title="Teilnehmerliste speichern (.json)"
                  >
                    <Download size={16} /> Speichern
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {categories.map(cat => (
                  <div key={cat} className="flex flex-col">
                    <div className="flex justify-between items-center mb-1 h-7">
                      {editingCategory === cat ? (
                        <div className="flex items-center gap-1 w-full mr-2">
                           <input 
                             autoFocus
                             value={editCategoryName}
                             onChange={e => setEditCategoryName(e.target.value)}
                             onKeyDown={e => {
                               if (e.key === 'Enter') saveEditedCategory(cat);
                               if (e.key === 'Escape') setEditingCategory(null);
                             }}
                             className="text-sm font-semibold text-slate-700 border-b border-teal-500 outline-none w-full bg-transparent py-0.5 px-1"
                           />
                           <button onClick={() => saveEditedCategory(cat)} className="text-teal-600 hover:bg-teal-50 p-1 rounded transition-colors"><Check size={14} /></button>
                           <button onClick={() => setEditingCategory(null)} className="text-slate-400 hover:bg-slate-100 p-1 rounded transition-colors"><X size={14} /></button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 overflow-hidden w-full">
                            <input 
                                type="checkbox"
                                checked={grandFinals.includes(cat)}
                                onChange={() => toggleGrandFinal(cat)}
                                className="w-3.5 h-3.5 text-amber-500 rounded border-slate-300 focus:ring-amber-500 cursor-pointer shrink-0"
                                title="Finale als 'Grand Final' ganz am Ende des Turniers spielen"
                            />
                            <label className="text-sm font-semibold text-slate-700 truncate pr-2 cursor-pointer" title={cat} onClick={() => toggleGrandFinal(cat)}>
                                {cat}
                            </label>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button 
                              onClick={() => addRandomPlayer(cat)} 
                              className="text-[10px] bg-teal-50 text-teal-600 hover:bg-teal-100 border border-teal-200 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                              title="Zufälligen Spieler (inkl. zufälliger LK) generieren"
                            >
                              <Dices size={12} /> Zufall
                            </button>
                            <button
                               onClick={() => { setEditingCategory(cat); setEditCategoryName(cat); }}
                               className="text-[10px] bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 px-2 py-1 rounded flex items-center transition-colors"
                               title="Kategorie umbenennen"
                            >
                               <Edit2 size={12} />
                            </button>
                            <button 
                              onClick={() => handleRemoveCategory(cat)} 
                              className="text-[10px] bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-2 py-1 rounded flex items-center transition-colors"
                              title="Kategorie löschen"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    <textarea 
                      className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all text-sm resize-none"
                      placeholder="Name, 5&#10;Name 2, 12&#10;..."
                      value={participants[cat] || ''}
                      onChange={(e) => handleParticipantChange(cat, e.target.value)}
                    />
                    <div className="text-xs text-slate-500 mt-1 text-right">
                      {getParticipantsList(cat).length} {getParticipantsList(cat).length === 1 ? 'Meldung' : 'Meldungen'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add New Category */}
              <div className="mt-8 pt-6 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">Weitere Kategorie hinzufügen</h3>
                  <div className="flex items-center gap-2 max-w-sm">
                      <input 
                          type="text"
                          className="flex-1 p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          placeholder="Name (z.B. Junioren U18)"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                      />
                      <button 
                          onClick={handleAddCategory}
                          disabled={!newCategoryName.trim()}
                          className="bg-slate-200 hover:bg-teal-600 hover:text-white text-slate-700 px-3 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:hover:bg-slate-200 disabled:hover:text-slate-700 flex items-center gap-1"
                      >
                          <Plus size={16}/> Hinzufügen
                      </button>
                  </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button 
                onClick={() => setActiveTab('settings')}
                className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                Weiter zu den Einstellungen <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Tab Content: Settings */}
        {activeTab === 'settings' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-3xl mx-auto">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Settings className="text-teal-600" /> Turniereinstellungen
              </h2>
              
              <div className="space-y-6">
                
                <div className="bg-slate-100 p-4 rounded-lg flex flex-col md:flex-row gap-4 items-start md:items-center">
                    <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer shrink-0">
                        <input 
                            type="checkbox" 
                            checked={compactMode} 
                            onChange={e => setCompactMode(e.target.checked)} 
                            className="w-5 h-5 text-teal-600 rounded border-slate-300 focus:ring-teal-500 cursor-pointer" 
                        />
                        Kompaktmodus aktivieren
                    </label>
                    {compactMode ? (
                        <div className="flex items-center gap-2 w-full md:ml-4 animate-in fade-in">
                            <span className="text-sm text-slate-600 shrink-0">Ziel-Dauer:</span>
                            <input 
                                type="number" 
                                min="1" max="48" 
                                value={maxTournamentHours} 
                                onChange={e => setMaxTournamentHours(parseInt(e.target.value) || 9)} 
                                className="w-16 p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-center font-bold" 
                            />
                            <span className="text-sm text-slate-600">Stunden</span>
                        </div>
                    ) : (
                        <div className="text-sm text-slate-500 md:ml-4">
                            Alle Teilnehmer spielen standardmäßig in der Vorrunde gegeneinander.
                        </div>
                    )}
                </div>

                <div className="bg-slate-100 p-4 rounded-lg flex flex-col md:flex-row gap-4 items-start md:items-center">
                    <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer shrink-0">
                        <input 
                            type="checkbox" 
                            checked={scheduleAllFinalsAtEnd} 
                            onChange={e => setScheduleAllFinalsAtEnd(e.target.checked)} 
                            className="w-5 h-5 text-teal-600 rounded border-slate-300 focus:ring-teal-500 cursor-pointer" 
                        />
                        Alle Finals am Ende spielen
                    </label>
                    <div className="text-sm text-slate-500 md:ml-4">
                        Behandelt jedes Finale automatisch als "Grand Final" und plant diese gesammelt ganz am Schluss des Turniers ein.
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Turnierbeginn (Uhrzeit)</label>
                    <input 
                      type="time" 
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Anzahl Plätze</label>
                    <input 
                      type="number" 
                      min="1" max="20"
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      value={numCourts}
                      onChange={(e) => setNumCourts(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Spielzeit Vorrunde (Min)</label>
                    <input 
                      type="number" 
                      min="10" max="120"
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      value={matchDuration}
                      onChange={(e) => setMatchDuration(parseInt(e.target.value) || 30)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Pausenzeit zw. Slots (Min)</label>
                    <input 
                      type="number" 
                      min="0" max="60"
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      value={breakDuration}
                      onChange={(e) => setBreakDuration(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Spielzeit Finale (Min)</label>
                    <input 
                      type="number" 
                      min="30" max="180"
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      value={finalDuration}
                      onChange={(e) => setFinalDuration(parseInt(e.target.value) || 90)}
                    />
                  </div>
                </div>

                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
                  <h4 className="font-semibold text-blue-800 text-sm">Spielmodus & Automatische Konfliktlösung</h4>
                  <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
                    {compactMode && (
                        <li><b>Kompaktmodus Aktiv:</b> Das System wandelt große Vorrundengruppen automatisch in ein effizientes K.O.-System (Single Elimination) um, falls das {maxTournamentHours}-Stunden Limit überschritten wird.</li>
                    )}
                    <li><b>Optimal Packing:</b> Das System füllt Lücken und zieht Spiele wann immer möglich dynamisch in frühere Zeitslots nach vorn, um die Platznutzung zu maximieren.</li>
                    <li><b>Grand Finals:</b> {scheduleAllFinalsAtEnd ? 'Alle Finals werden automatisch gesammelt am Ende gespielt.' : 'Durch Anhaken der Checkbox bei einer Kategorie im Teilnehmer-Reiter wird das zugehörige Finale ganz ans Ende des Turniers gesetzt. Nicht angehakte Finals rücken so früh wie möglich nach vorne.'}</li>
                    <li>Ergebnisse (außer Finals) im Format <b>10:5</b> eintragen. Das System bestimmt den Sieger automatisch.</li>
                  </ul>
                </div>
              </div>

              <div className="mt-8 border-t border-slate-100 pt-6 flex justify-between">
                <button 
                  onClick={() => setActiveTab('participants')}
                  className="text-slate-600 hover:text-slate-900 px-4 py-2 font-medium transition-colors"
                >
                  Zurück
                </button>
                <button 
                  onClick={generateSchedule}
                  disabled={isGenerating}
                  className="bg-teal-600 hover:bg-teal-500 text-white px-8 py-3 rounded-lg font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-2 disabled:opacity-70"
                >
                  {isGenerating ? (
                    <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Berechne...</>
                  ) : (
                    <><Play size={18} fill="currentColor" /> Spielplan Generieren</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Schedule */}
        {activeTab === 'schedule' && timeSlots && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center mb-6 print:hidden">
               <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                 <Calendar className="text-teal-600" /> Offizieller Spielplan
               </h2>
               <button onClick={() => window.print()} className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors hidden md:block print:hidden">
                 Plan Drucken
               </button>
            </div>

            {/* Print View: Compact Table */}
            <div className="hidden print:block">
                <h2 className="text-2xl font-bold text-slate-800 mb-4 border-b border-slate-300 pb-2">
                    Spielplan - Vereinsmeisterschaft
                </h2>
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
                                        <td className="border border-slate-300 p-2 whitespace-nowrap">{slot.time} - {slot.endTime}</td>
                                        <td className="border border-slate-300 p-2 text-center font-semibold">{match.court}</td>
                                        <td className="border border-slate-300 p-2 font-medium">
                                            {match.category} <span className="text-slate-500 font-normal">({match.type})</span>
                                        </td>
                                        <td className="border border-slate-300 p-2 break-words">
                                            {match.player1} <span className="text-slate-400 italic px-2">vs</span> {match.player2}
                                        </td>
                                        <td className="border border-slate-300 p-2 font-bold text-center w-24">{match.score || ''}</td>
                                    </tr>
                                );
                            })
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Web View: Interactive Cards */}
            <div className="space-y-6 pb-20 print:hidden">
              {timeSlots.map((slot, index) => (
                <div key={index} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className={`px-4 py-3 border-b flex items-center justify-between ${slot.slotType === 'final' ? 'bg-amber-100 border-amber-200' : 'bg-slate-100 border-slate-200'}`}>
                    <div className="flex items-center gap-2 font-bold text-lg text-slate-800">
                      <Clock size={20} className={slot.slotType === 'final' ? 'text-amber-600' : 'text-slate-500'} />
                      {slot.time} - {slot.endTime} Uhr
                    </div>
                    {slot.slotType === 'final' && (
                      <span className="bg-amber-500 text-white text-xs px-2 py-1 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                        <Trophy size={12} /> Finals
                      </span>
                    )}
                  </div>

                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {slot.matchIds.map(id => {
                      const match = matchData[id];
                      if (!match) return null;
                      return <MatchCard key={id} match={match} onSaveResult={handleUpdateResult} />;
                    })}
                  </div>
                </div>
              ))}

              {timeSlots.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Calendar size={48} className="mx-auto text-slate-300 mb-4" />
                  <p>Es konnten keine Spiele generiert werden.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab Content: Brackets */}
        {activeTab === 'brackets' && tournamentStructures && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center mb-6 print:hidden">
               <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                 <Grid className="text-teal-600" /> Tabellen & Turnierbaum
               </h2>
               <button onClick={() => window.print()} className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors hidden md:block print:hidden">
                 Drucken
               </button>
            </div>

            <div className="space-y-8 pb-20">
              {categories.map((cat, index) => {
                const data = tournamentStructures[cat];
                if (!data) return null;
                
                const catMatches = Object.values(matchData).filter(m => m.category === cat);
                const semis = catMatches.filter(m => m.stage === 'semi').sort((a, b) => a.semiIndex - b.semiIndex);
                const final = catMatches.find(m => m.stage === 'final' && (!m.koRound || m.koRound === 1));

                return (
                  <div key={cat} className={`bg-white rounded-xl shadow-sm border border-slate-200 p-6 overflow-hidden print:break-after-page print:border-none print:shadow-none print:p-0 ${index > 0 ? 'print:pt-4' : ''}`}>
                    <h3 className="text-xl font-bold text-teal-700 mb-6 border-b pb-2 flex justify-between items-center">
                        {cat}
                        {data.type === 'knockout' && <span className="text-xs bg-teal-100 text-teal-800 px-2 py-1 rounded uppercase tracking-widest font-bold">K.O.-System</span>}
                    </h3>
                    
                    {data.type === 'knockout' ? (
                        <div className="flex gap-4 items-center overflow-x-auto p-4 bg-slate-50/50 rounded-xl border border-slate-100 shadow-inner min-h-[300px] print:bg-transparent print:border-none print:shadow-none">
                            {[...new Set(catMatches.filter(m => m.stage === 'ko').map(m => m.koRound))].sort((a,b)=>b-a).map(r => {
                                const mInRound = catMatches.filter(m => m.koRound === r).sort((a,b)=>a.matchIndex - b.matchIndex);
                                return (
                                    <div key={r} className="flex flex-col gap-6 justify-around min-w-[200px] h-full">
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
                                <div className="flex flex-col w-full min-w-[220px] relative z-10 bg-amber-50 border border-amber-200 p-4 rounded-xl ml-4 print:bg-transparent print:border-2">
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
                        <div className="flex flex-col lg:flex-row gap-8">
                          {/* Groups */}
                          {Object.keys(data.groups || {}).length > 0 && (
                            <div className="flex-1 space-y-4">
                              <h4 className="font-semibold text-slate-600 flex items-center gap-2">Gruppenphase (Standings)</h4>
                              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                {Object.keys(data.groups).map((gName, idx) => {
                                  const standings = calculateStandings(gName, data, catMatches);
                                  const groupMatchesForTable = catMatches.filter(m => m.stage === 'group' && m.groupName === gName);

                                  return (
                                    <div key={idx} className="border border-slate-200 rounded-lg overflow-hidden shadow-sm flex flex-col print:break-inside-avoid">
                                      <div className="bg-slate-50 px-4 py-2 font-bold text-sm text-slate-700 border-b flex justify-between print:bg-transparent">
                                        <span>{gName}</span>
                                      </div>
                                      
                                      <div className="bg-slate-50 flex text-xs font-bold text-slate-500 border-b px-4 py-1.5 print:bg-transparent">
                                        <div className="w-1/2">Spieler</div>
                                        <div className="flex w-1/2 justify-end gap-3 text-center">
                                          <div className="w-6" title="Siege">S</div>
                                          <div className="w-10" title="Spiele (Games)">G</div>
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

                                      {/* Gruppenspiele Liste */}
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
                          
                          {/* Knockout */}
                          {(semis.length > 0 || final) && (
                            <div className="flex-1 border-l border-slate-100 pl-0 lg:pl-8 mt-8 lg:mt-0 print:border-none print:pl-0">
                              <h4 className="font-semibold text-slate-600 mb-4 print:hidden">K.O.-Runde</h4>
                              <div className="flex gap-4 items-center h-full min-h-[200px] bg-slate-50/50 rounded-xl border border-slate-100 p-6 overflow-x-auto relative shadow-inner print:bg-transparent print:border-none print:shadow-none print:p-0">
                                
                                {semis.length > 0 && (
                                  <div className="flex flex-col gap-6 justify-around min-w-[200px]">
                                    {semis.map((semi, i) => (
                                      <div key={i} className="bg-white border-2 border-slate-200 p-2 rounded-lg shadow-sm text-sm font-medium text-slate-800 relative z-10 print:shadow-none">
                                        <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">{semi.name}</div>
                                        <div className={`break-words p-1 rounded ${semi.winner === semi.player1 ? 'bg-teal-50 font-bold text-teal-700 print:bg-transparent' : ''}`}>{semi.player1}</div>
                                        <div className="border-t border-slate-100 my-1"></div>
                                        <div className={`break-words p-1 rounded ${semi.winner === semi.player2 ? 'bg-teal-50 font-bold text-teal-700 print:bg-transparent' : ''}`}>{semi.player2}</div>
                                      </div>
                                    ))}
                                  </div>
                                )}
    
                                {semis.length > 0 && final && (
                                  <div className="flex-1 flex justify-center text-slate-300 print:hidden">
                                    <ChevronRight size={32} />
                                  </div>
                                )}
    
                                {final && (
                                  <div className="flex flex-col w-full min-w-[220px] relative z-10 bg-amber-50 border border-amber-200 p-4 rounded-xl print:bg-transparent print:border-2">
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
          </div>
        )}
      </main>
    </div>
  );
}

// Reusable UI Components
function TabButton({ active, onClick, icon, label, disabled, highlight }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all
        ${active ? 'bg-teal-600 text-white shadow-md' : 'bg-transparent text-slate-600 hover:bg-slate-100'}
        ${disabled ? 'opacity-50 cursor-not-allowed hover:bg-transparent' : ''}
        ${highlight && !active ? 'ring-2 ring-teal-500 ring-offset-1 text-teal-700 bg-teal-50' : ''}
      `}
    >
      {icon} {label}
    </button>
  );
}

function MatchCard({ match, onSaveResult }) {
  const [isEditing, setIsEditing] = useState(false);
  const [scoreInput, setScoreInput] = useState(match.score || '');
  const [winnerInput, setWinnerInput] = useState(match.winner || '');

  useEffect(() => {
     setScoreInput(match.score || '');
     setWinnerInput(match.winner || '');
  }, [match.score, match.winner]);

  const isPlaceholder = match.player1.includes('Gruppe') || match.player1.includes('Sieger') || match.player1.includes('Platz');

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
    <div className={`border rounded-lg p-3 relative flex flex-col h-full ${match.isFinal ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 bg-white shadow-sm'}`}>
      
      <div className="text-xs font-semibold text-teal-600 mb-1 flex justify-between items-center">
        <span className="break-words pr-2">{match.category}</span>
        <span className="text-slate-400 font-normal whitespace-nowrap">Platz {match.court}</span>
      </div>
      
      {!match.isFinal && (
        <div className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-bold">{match.type} {match.name && `- ${match.name}`}</div>
      )}
      {match.isFinal && (
        <div className="text-xs text-amber-600 mb-2 uppercase tracking-wide font-bold flex items-center gap-1"><Trophy size={12}/> {match.type}</div>
      )}

      {/* Players */}
      <div className="flex flex-col gap-2 flex-grow">
        <div className={`font-medium text-sm flex items-start gap-2 ${match.winner === match.player1 ? 'text-teal-700 font-bold' : 'text-slate-700'}`}>
          <span className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-400 flex-shrink-0 mt-0.5">1</span>
          <span className="break-words">{match.player1}</span>
        </div>
        <div className="text-[10px] text-slate-300 text-center font-serif italic my-[-4px]">vs</div>
        <div className={`font-medium text-sm flex items-start gap-2 ${match.winner === match.player2 ? 'text-teal-700 font-bold' : 'text-slate-700'}`}>
          <span className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-400 flex-shrink-0 mt-0.5">2</span>
          <span className="break-words">{match.player2}</span>
        </div>
      </div>

      {/* Result / Action Area */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        {!isPlaceholder ? (
          !isEditing && match.winner ? (
            <div className="flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-100">
              <div className="text-sm font-bold text-slate-800">{match.score}</div>
              <button onClick={() => setIsEditing(true)} className="text-slate-400 hover:text-teal-600 transition-colors p-1" title="Ergebnis bearbeiten">
                <Edit2 size={14} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input 
                type="text" 
                placeholder={match.isFinal ? "Sätze (z.B. 6:4, 6:2)" : "Ergebnis (z.B. 10:5)"} 
                className="w-full text-xs p-2 border border-slate-200 rounded focus:ring-1 focus:ring-teal-500 outline-none"
                value={scoreInput}
                onChange={handleScoreChange}
              />
              
              {match.isFinal ? (
                 <div className="flex gap-1">
                    <button 
                      onClick={() => setWinnerInput(match.player1)}
                      className={`flex-1 text-[10px] py-1.5 rounded border transition-colors px-1 ${winnerInput === match.player1 ? 'bg-amber-500 text-white border-amber-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                    >Sieg P1</button>
                    <button 
                      onClick={() => setWinnerInput(match.player2)}
                      className={`flex-1 text-[10px] py-1.5 rounded border transition-colors px-1 ${winnerInput === match.player2 ? 'bg-amber-500 text-white border-amber-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                    >Sieg P2</button>
                    <button 
                      onClick={handleSave} disabled={!winnerInput}
                      className="bg-slate-800 text-white px-2 rounded hover:bg-slate-700 disabled:opacity-50 flex items-center"
                    ><Check size={14} /></button>
                 </div>
              ) : (
                 <button 
                    onClick={handleSave}
                    disabled={!winnerInput}
                    className="w-full bg-slate-800 text-white text-xs py-2 rounded hover:bg-slate-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                  >
                    <Check size={14} /> Speichern
                  </button>
              )}
            </div>
          )
        ) : (
          <div className="text-[10px] text-center text-slate-400 font-medium bg-slate-50 py-1.5 rounded">
             {match.isFinal ? 'Finalisten noch offen' : 'Wartet auf Vorrunde'}
          </div>
        )}
      </div>
    </div>
  );
}