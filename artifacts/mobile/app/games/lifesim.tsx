/**
 * LIFE EARTH — Advanced Life Simulation Engine v3.0
 * Endless · Branching Consequences · Mind-Based · Multiplayer Leaderboard
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Modal, Platform,
  Pressable, StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import * as Haptics from "@/lib/haptics";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tag =
  | "Scholar" | "Athlete" | "Artist" | "Hustler" | "Criminal" | "Rebel"
  | "Leader" | "Spiritual" | "Lonely" | "Social" | "Risk_Taker" | "Mentor"
  | "Family" | "Graduate" | "Trade" | "Traveler" | "Doctor" | "Engineer"
  | "Lawyer" | "Entrepreneur" | "Politician" | "Corrupt" | "Tech" | "Media"
  | "Military" | "Philosopher" | "Investor" | "Creator" | "Survivor"
  | "Visionary" | "Strategist" | "Recluse" | "Activist";

type Stats = {
  health: number;
  education: number;
  happiness: number;
  wealth: number;
  reputation: number;
  fitness: number;
  morality: number;
};

type Choice = {
  icon: string;
  label: string;
  sub: string;
  effect: Partial<Stats>;
  grantsTag?: Tag;
  risky?: boolean;
  requiredTags?: Tag[];
  blockedTags?: Tag[];
};

type Scene = {
  id: string;
  ageMin: number;
  ageMax: number;
  title: string;
  narrative: string;
  choices: Choice[];
  requiredAnyTags?: Tag[];
  blockedTags?: Tag[];
};

type LogEntry = { age: number; text: string; icon: string };

type GameState = {
  playerId: string;
  age: number;
  stats: Stats;
  tags: Tag[];
  career: string | null;
  country: string;
  flag: string;
  familyClass: string;
  birthYear: number;
  scenesSeen: string[];
  log: LogEntry[];
  legacyScore: number;
  pendingEvent: RandomEvent | null;
};

type RandomEvent = {
  title: string;
  text: string;
  icon: string;
  effect: Partial<Stats>;
  type: "good" | "bad" | "neutral";
};

type UiPhase = "loading" | "birth" | "playing" | "event" | "leaderboard";

// ─── World Data ───────────────────────────────────────────────────────────────

const COUNTRIES = [
  { name: "Nigeria",      flag: "🇳🇬", wealthMod: 0.55 },
  { name: "USA",          flag: "🇺🇸", wealthMod: 1.60 },
  { name: "India",        flag: "🇮🇳", wealthMod: 0.75 },
  { name: "Brazil",       flag: "🇧🇷", wealthMod: 0.85 },
  { name: "Germany",      flag: "🇩🇪", wealthMod: 1.45 },
  { name: "Japan",        flag: "🇯🇵", wealthMod: 1.35 },
  { name: "Kenya",        flag: "🇰🇪", wealthMod: 0.55 },
  { name: "Australia",    flag: "🇦🇺", wealthMod: 1.45 },
  { name: "UK",           flag: "🇬🇧", wealthMod: 1.40 },
  { name: "South Africa", flag: "🇿🇦", wealthMod: 0.70 },
  { name: "China",        flag: "🇨🇳", wealthMod: 1.05 },
  { name: "France",       flag: "🇫🇷", wealthMod: 1.35 },
  { name: "Ethiopia",     flag: "🇪🇹", wealthMod: 0.45 },
  { name: "UAE",          flag: "🇦🇪", wealthMod: 1.55 },
  { name: "South Korea",  flag: "🇰🇷", wealthMod: 1.30 },
  { name: "Singapore",    flag: "🇸🇬", wealthMod: 1.60 },
  { name: "Mexico",       flag: "🇲🇽", wealthMod: 0.80 },
  { name: "Ghana",        flag: "🇬🇭", wealthMod: 0.62 },
  { name: "Indonesia",    flag: "🇮🇩", wealthMod: 0.78 },
  { name: "Sweden",       flag: "🇸🇪", wealthMod: 1.50 },
];

const FAMILIES = [
  { label: "Destitute",     wealth: 200,     wealthMod: 0.3,  desc: "No running water. Survival is everything." },
  { label: "Poor",          wealth: 1200,    wealthMod: 0.55, desc: "Every month is a struggle." },
  { label: "Working Class", wealth: 8000,    wealthMod: 0.85, desc: "Honest work, modest home." },
  { label: "Middle Class",  wealth: 35000,   wealthMod: 1.0,  desc: "Comfortable, with room to grow." },
  { label: "Upper Middle",  wealth: 120000,  wealthMod: 1.2,  desc: "Private schools, strong network." },
  { label: "Wealthy",       wealth: 400000,  wealthMod: 1.5,  desc: "Old money. Doors already open." },
  { label: "Ultra-Rich",    wealth: 2000000, wealthMod: 1.8,  desc: "Born into the 1%. The world knows your family." },
];

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

function seededRng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >> 7;
    h ^= h << 17;
    return ((h >>> 0) / 0xFFFFFFFF);
  };
}

function seededPick<T>(arr: T[], seed: string): T {
  const rng = seededRng(seed);
  return arr[Math.floor(rng() * arr.length)];
}

// ─── Scene Pool ───────────────────────────────────────────────────────────────

const SCENE_POOL: Scene[] = [

  // ── INFANT (0–3) ─────────────────────────────────────────────────────────

  {
    id: "inf_nature", ageMin: 0, ageMax: 3,
    title: "The First Impression",
    narrative: "You are a baby. You can't speak yet, but you feel everything — warmth, tension, love, hunger. The adults around you are shaping who you'll become. Already, something in you is awake.",
    choices: [
      { icon: "👁️", label: "Watch everything silently", sub: "Absorbing more than anyone knows.", effect: { education: 6, happiness: 3 }, grantsTag: "Scholar" },
      { icon: "😄", label: "Laugh and charm the room",  sub: "Pure joy. Everyone loves you instantly.", effect: { happiness: 10, reputation: 4 }, grantsTag: "Social" },
      { icon: "😤", label: "Demand your needs loudly",  sub: "You know what you want.", effect: { health: 6, fitness: 4 }, grantsTag: "Risk_Taker" },
    ],
  },

  // ── CHILDHOOD (4–12) ─────────────────────────────────────────────────────

  {
    id: "ch_nursery", ageMin: 4, ageMax: 6,
    title: "Nursery School",
    narrative: "You are four. The teacher watches how you interact. Some children fight over toys. Some share. Some build alone. The room is loud and bright. You already know what you prefer.",
    choices: [
      { icon: "🧱", label: "Build something alone", sub: "You don't need anyone else.", effect: { education: 7, happiness: 4 }, grantsTag: "Recluse" },
      { icon: "🤝", label: "Invite others to build with you", sub: "You make the group stronger.", effect: { reputation: 8, happiness: 8 }, grantsTag: "Leader" },
      { icon: "🎨", label: "Paint your own world", sub: "No one sees what you see.", effect: { happiness: 10, education: 4 }, grantsTag: "Artist" },
    ],
  },
  {
    id: "ch_school1", ageMin: 7, ageMax: 9,
    title: "Primary School",
    narrative: "You are eight. Tests, friendships, playgrounds. Your teacher says your future depends on habits formed now. One morning you face a real choice about who you want to be here.",
    choices: [
      { icon: "📚", label: "Study hard, chase top marks", sub: "Sacrifice play for position.", effect: { education: 18, happiness: -5 }, grantsTag: "Scholar" },
      { icon: "⚽", label: "Dominate every sport", sub: "Your body becomes a tool.", effect: { fitness: 18, health: 12, happiness: 10 }, grantsTag: "Athlete" },
      { icon: "🤡", label: "Make everyone laugh", sub: "Popular but distracted.", effect: { happiness: 16, reputation: 8, education: -4 }, grantsTag: "Social" },
      { icon: "🎸", label: "Music and art fill your hours", sub: "Your world is richer than theirs.", effect: { happiness: 14, education: 6 }, grantsTag: "Creator" },
    ],
  },
  {
    id: "ch_bully", ageMin: 8, ageMax: 11,
    title: "The Threat",
    narrative: "An older student has been terrorising your class for weeks. Today it's directed at your closest friend. Everyone is watching. This moment will define your reputation for years.",
    choices: [
      { icon: "🛡️", label: "Step in. Protect your friend.", sub: "Cost you something. Worth it.", effect: { reputation: 14, happiness: 8, health: -5 }, grantsTag: "Leader" },
      { icon: "📣", label: "Get a teacher immediately", sub: "Smart. Effective. Called a snitch.", effect: { education: 4, reputation: -4, happiness: 3 }, grantsTag: "Strategist" },
      { icon: "👀", label: "Watch. Do nothing.", sub: "Safe. You'll remember this.", effect: { happiness: -8, morality: -10 }, grantsTag: "Lonely" },
    ],
  },
  {
    id: "ch_money", ageMin: 9, ageMax: 12,
    title: "First Money",
    narrative: "A neighbour offers to pay you for a simple job — cleaning, running errands. It's the first time money is yours to control. The amount is small but the decision is not.",
    choices: [
      { icon: "💰", label: "Spend it immediately on yourself", sub: "Gratification now.", effect: { happiness: 10, wealth: 500 } },
      { icon: "🏦", label: "Save every cent", sub: "Future you will be grateful.", effect: { wealth: 1200, education: 3 }, grantsTag: "Investor" },
      { icon: "🎁", label: "Buy something for your family", sub: "They remember this.", effect: { happiness: 12, reputation: 8, morality: 8 }, grantsTag: "Family" },
    ],
  },
  {
    id: "ch_crisis", ageMin: 10, ageMax: 12,
    title: "Home Under Pressure",
    narrative: "Something is wrong at home. Arguments at night. Money missing. A parent under stress. You are ten and you feel it. Nobody talks to you about it, but you understand more than they think.",
    choices: [
      { icon: "🛡️", label: "Step up. Protect your siblings.", sub: "You mature faster than you should.", effect: { reputation: 10, happiness: -6, health: -3 }, grantsTag: "Survivor" },
      { icon: "📖", label: "Retreat into books and learning", sub: "Knowledge becomes escape.", effect: { education: 14, happiness: 4 }, grantsTag: "Scholar" },
      { icon: "😶", label: "Suppress it. Carry it alone.", sub: "It shapes you silently.", effect: { happiness: -12, health: -5, morality: 5 }, grantsTag: "Recluse" },
    ],
  },

  // ── TEEN (13–17) ─────────────────────────────────────────────────────────

  {
    id: "teen_identity", ageMin: 13, ageMax: 14,
    title: "Who Are You?",
    narrative: "Secondary school. Everything changes at once — how you're seen, what you want, who you fear. You feel the pressure to belong. Somewhere inside you knows who you really are. The question is whether you'll be that person.",
    choices: [
      { icon: "📖", label: "The academic one", sub: "Grades above everything.", effect: { education: 18, happiness: -4 }, grantsTag: "Scholar" },
      { icon: "🎸", label: "The creative one", sub: "Art, music, theatre — your tribe.", effect: { happiness: 15, reputation: 8, education: 5 }, grantsTag: "Artist" },
      { icon: "🏃", label: "The sports one", sub: "Your body is your identity.", effect: { fitness: 20, health: 15, reputation: 12 }, grantsTag: "Athlete" },
      { icon: "💼", label: "The one with plans", sub: "Already thinking about money.", effect: { wealth: 2500, education: -4, reputation: 5 }, grantsTag: "Hustler" },
    ],
  },
  {
    id: "teen_exams", ageMin: 14, ageMax: 16,
    title: "The Tests That Matter",
    narrative: "The exams that shape what you can do next are coming. Three months away. Your friends are spending evenings out. Your parents are silent with worry. You know what's at stake.",
    choices: [
      { icon: "🔥", label: "Total lockdown — study everything", sub: "Give up now, win later.", effect: { education: 24, happiness: -12 }, grantsTag: "Scholar" },
      { icon: "⚖️", label: "Balance — study and live", sub: "A sustainable approach.", effect: { education: 13, happiness: 8 } },
      { icon: "🎮", label: "Barely prepare", sub: "Regret arrives on results day.", effect: { education: -10, happiness: 12, wealth: -1500 } },
    ],
  },
  {
    id: "teen_crossroads", ageMin: 15, ageMax: 17,
    title: "The Offer",
    narrative: "Older boys approach you with a way to make serious money fast. It's clearly illegal. Your gut tightens. The money would change everything at home — but so would the consequences.",
    choices: [
      { icon: "🚫", label: "Refuse. Walk away clean.", sub: "Hard. Correct.", effect: { reputation: 10, morality: 12, happiness: 5 } },
      { icon: "🤝", label: "Help a friend in trouble instead", sub: "Loyal. Costs you.", effect: { happiness: 12, wealth: -500, reputation: 10, morality: 8 } },
      { icon: "😈", label: "Take the money. Take the risk.", sub: "Cash now. Consequences later.", effect: { wealth: 7000, reputation: -20, health: -8, morality: -20 }, grantsTag: "Criminal", risky: true },
    ],
  },
  {
    id: "teen_sport_peak", ageMin: 14, ageMax: 17,
    title: "The Coach's Call",
    narrative: "Your coach tells you that you have real potential. A regional competition could launch your career. But training six days a week means dropping several subjects and most social life.",
    choices: [
      { icon: "🏆", label: "Go all in. Training is life now.", sub: "The price of greatness.", effect: { fitness: 25, health: 15, reputation: 14, education: -10, happiness: -5 }, grantsTag: "Athlete" },
      { icon: "⚖️", label: "Train hard but keep school", sub: "Slower progress, more options.", effect: { fitness: 12, health: 8, education: 6, happiness: 6 } },
      { icon: "📚", label: "Turn it down. School first.", sub: "The coach is disappointed. You're not.", effect: { education: 14, happiness: -6, reputation: -4 } },
    ],
    requiredAnyTags: ["Athlete"],
  },
  {
    id: "teen_art_break", ageMin: 14, ageMax: 17,
    title: "The Opportunity",
    narrative: "An independent gallery wants to show your work. A music producer heard your demo. The attention is real and sudden. Taking it means leaving school early — maybe permanently.",
    choices: [
      { icon: "✈️", label: "Take the leap. Now or never.", sub: "Raw talent. Huge risk.", effect: { reputation: 18, happiness: 20, education: -15, wealth: 3000 }, grantsTag: "Creator", risky: true },
      { icon: "📅", label: "Negotiate — finish school first", sub: "Delayed, but safer.", effect: { reputation: 8, happiness: 10, education: 8 } },
      { icon: "📚", label: "Stay in school. Keep creating.", sub: "Your time will come.", effect: { education: 14, happiness: 5, reputation: 4 } },
    ],
    requiredAnyTags: ["Artist", "Creator"],
  },
  {
    id: "teen_rebellion", ageMin: 15, ageMax: 17,
    title: "Against the Current",
    narrative: "The system — school, authority, your parents' expectations — feels like a trap. You see what others accept without question. Something in you refuses. This is the moment you decide what kind of rebel you'll be.",
    choices: [
      { icon: "✊", label: "Channel it into activism", sub: "Anger with purpose.", effect: { reputation: 12, morality: 10, happiness: 8, education: -5 }, grantsTag: "Activist" },
      { icon: "🎭", label: "Express it through art", sub: "Your rage becomes beautiful.", effect: { happiness: 16, reputation: 10, education: 4 }, grantsTag: "Creator" },
      { icon: "🚶", label: "Quietly build your alternative", sub: "No noise. Just work.", effect: { education: 8, happiness: 6, wealth: 2000 }, grantsTag: "Entrepreneur" },
      { icon: "💥", label: "Burn it all down. See what's left.", sub: "Satisfying. Costly.", effect: { happiness: 10, reputation: -14, education: -8, morality: -8 }, grantsTag: "Rebel", risky: true },
    ],
  },

  // ── YOUNG ADULT (18–27) ──────────────────────────────────────────────────

  {
    id: "ya_post_school", ageMin: 18, ageMax: 19,
    title: "After Everything",
    narrative: "School is over. The structure that defined your life for fifteen years is gone. What comes next is entirely up to you. This single decision reshapes the next decade.",
    choices: [
      { icon: "🎓", label: "University — invest in the long game", sub: "Four years. High cost. High ceiling.", effect: { education: 28, wealth: -30000 }, grantsTag: "Graduate" },
      { icon: "🔧", label: "Vocational training", sub: "Skilled. Employed in 18 months.", effect: { education: 14, wealth: -4000 }, grantsTag: "Trade" },
      { icon: "🏢", label: "Work immediately", sub: "Earn now. Learn on the job.", effect: { wealth: 18000, education: -5 } },
      { icon: "✈️", label: "Travel first", sub: "Experience the world. Perspective gained.", effect: { happiness: 22, reputation: 8, wealth: -9000 }, grantsTag: "Traveler" },
    ],
    blockedTags: ["Criminal"],
  },
  {
    id: "ya_post_school_alt", ageMin: 18, ageMax: 19,
    title: "A Different Starting Line",
    narrative: "School is over — but your record follows you. The doors others walk through are narrower for you. You could fight that. You could accept it. You could use it.",
    choices: [
      { icon: "💼", label: "Legitimate path — work and rebuild", sub: "Hard road. Real respect eventually.", effect: { wealth: 12000, reputation: 6, morality: 10 } },
      { icon: "🌍", label: "Leave. Start fresh abroad.", sub: "No record follows you there.", effect: { happiness: 15, wealth: -5000, reputation: 5 }, grantsTag: "Traveler" },
      { icon: "🕴️", label: "Stay in the network. Go deeper.", sub: "It's all you know.", effect: { wealth: 18000, reputation: -12, morality: -15, health: -6 }, grantsTag: "Criminal", risky: true },
    ],
    requiredAnyTags: ["Criminal"],
  },
  {
    id: "ya_first_job", ageMin: 20, ageMax: 22,
    title: "First Real Job",
    narrative: "You land your first proper job. The workplace is nothing like you imagined. Your boss is demanding, some colleagues territorial, and the politics are real. How you play this shapes your trajectory.",
    choices: [
      { icon: "🌟", label: "Outwork everyone. Be noticed.", sub: "Long hours. Fast track. High cost.", effect: { wealth: 12000, reputation: 14, health: -6, happiness: -8 }, grantsTag: "Strategist" },
      { icon: "🤗", label: "Build allies everywhere", sub: "Relationships open every door.", effect: { reputation: 18, happiness: 10, wealth: 6000 }, grantsTag: "Social" },
      { icon: "⚖️", label: "Do the job. Protect your time.", sub: "Steady. Respected. Sustainable.", effect: { wealth: 8000, happiness: 14 } },
      { icon: "🚪", label: "Quit and find something better", sub: "Bold. Takes time. Worth it.", effect: { wealth: -4000, happiness: -5, education: 6 } },
    ],
  },
  {
    id: "ya_career_choice", ageMin: 22, ageMax: 25,
    title: "The Direction",
    narrative: "You're 23. It's time to commit. The field you choose now will dominate the next twenty years. People around you are locking in. The wrong choice is survivable — but expensive.",
    choices: [
      { icon: "🏥", label: "Medicine — save lives", sub: "Years of training. Lifetime of impact.", effect: { education: 20, reputation: 22, wealth: -8000 }, grantsTag: "Doctor", blockedTags: ["Criminal"] },
      { icon: "💻", label: "Technology", sub: "Future-proof. Well-paid. Global.", effect: { education: 14, wealth: 22000, reputation: 10 }, grantsTag: "Tech" },
      { icon: "⚖️", label: "Law", sub: "Power through knowledge.", effect: { education: 16, reputation: 20, wealth: -5000 }, grantsTag: "Lawyer", blockedTags: ["Criminal"] },
      { icon: "🚀", label: "Start your own thing", sub: "High risk. Unlimited ceiling.", effect: { wealth: -10000, reputation: 8, happiness: 14 }, grantsTag: "Entrepreneur", risky: true },
    ],
  },
  {
    id: "ya_career_alt", ageMin: 22, ageMax: 25,
    title: "The Shadow Economy",
    narrative: "The regular world has structures you can't access. But you know people. You've built trust. An operation is growing and your role could be substantial — and very lucrative.",
    choices: [
      { icon: "🕴️", label: "Take the position. Own it.", sub: "Money. Power. Constant danger.", effect: { wealth: 45000, reputation: -20, morality: -20, health: -10 }, grantsTag: "Criminal", risky: true },
      { icon: "🔄", label: "Use your network — go legit", sub: "Your connections are valuable legally too.", effect: { wealth: 18000, reputation: 5, morality: 8 }, grantsTag: "Entrepreneur" },
      { icon: "🚶", label: "Walk away entirely", sub: "Nothing changes if nothing changes.", effect: { morality: 15, happiness: 8, wealth: -2000 } },
    ],
    requiredAnyTags: ["Criminal"],
  },
  {
    id: "ya_relationship", ageMin: 20, ageMax: 26,
    title: "The Person",
    narrative: "You meet someone who makes the world different. The pull is real. But so is your ambition. Every serious relationship costs you something and gives you something. You choose how much.",
    choices: [
      { icon: "❤️", label: "Commit fully. Build a life.", sub: "Beautiful. Consuming. Permanent.", effect: { happiness: 22, health: 8, wealth: -3000 }, grantsTag: "Family" },
      { icon: "⚖️", label: "Take it slowly. Keep your focus.", sub: "Measured. Smart. Lonely sometimes.", effect: { happiness: 12, education: 5 } },
      { icon: "🚫", label: "Not now. Focus on your goals.", sub: "Discipline. They move on.", effect: { education: 10, happiness: -10 } },
    ],
  },
  {
    id: "ya_ethics", ageMin: 21, ageMax: 26,
    title: "The Compromise",
    narrative: "Your manager asks you to sign off on something that is at best a grey area, at worst fraud. The company benefits. You'd benefit. Nobody would know. The question is whether that matters to you.",
    choices: [
      { icon: "🚫", label: "Refuse. Report it.", sub: "You're the problem now. And the solution.", effect: { reputation: 15, morality: 20, happiness: -8, wealth: -3000 }, grantsTag: "Activist" },
      { icon: "🤐", label: "Refuse quietly. Say nothing.", sub: "Clean hands. Complicit silence.", effect: { morality: 8, happiness: -5 } },
      { icon: "✅", label: "Sign it. Benefit. Move on.", sub: "Short-term smart. Long-term dangerous.", effect: { wealth: 12000, reputation: -8, morality: -18 }, grantsTag: "Corrupt", risky: true },
    ],
  },

  // ── ADULT (28–47) ────────────────────────────────────────────────────────

  {
    id: "ad_career_peak", ageMin: 28, ageMax: 35,
    title: "The Offer You Didn't See Coming",
    narrative: "A call. A message. An opportunity so significant you need to sit down. It will require you to relocate, disrupt your current life, and trust someone new. The risk is real. So is the reward.",
    choices: [
      { icon: "✈️", label: "Take it. Move. Change.", sub: "Everything you've built — leverage it.", effect: { wealth: 35000, reputation: 18, happiness: 10, health: -5 }, risky: true },
      { icon: "🔍", label: "Negotiate from where you are", sub: "Smart. You know your worth.", effect: { wealth: 20000, reputation: 12, happiness: 8 }, grantsTag: "Strategist" },
      { icon: "🏠", label: "Stay. Build deeper roots here.", sub: "Stability over ambition.", effect: { happiness: 14, health: 8, reputation: 5 }, grantsTag: "Family" },
    ],
  },
  {
    id: "ad_investment", ageMin: 28, ageMax: 40,
    title: "The Money Decision",
    narrative: "You have savings for the first time in your life. A trusted contact presents an investment opportunity. Your gut says something but you're not sure which way it's pulling.",
    choices: [
      { icon: "📈", label: "Invest everything — go big", sub: "High risk. Could define your future.", effect: { wealth: 60000, happiness: 8 }, grantsTag: "Investor", risky: true },
      { icon: "⚖️", label: "Invest half. Keep half safe.", sub: "Balanced. Rational.", effect: { wealth: 25000, happiness: 6 }, grantsTag: "Strategist" },
      { icon: "🏦", label: "Keep it in savings", sub: "Safe. Slow. Certain.", effect: { wealth: 8000, happiness: 4 } },
      { icon: "🏘️", label: "Buy property", sub: "Bricks over speculation.", effect: { wealth: 18000, reputation: 6, happiness: 10 }, grantsTag: "Investor" },
    ],
  },
  {
    id: "ad_startup", ageMin: 28, ageMax: 40,
    title: "The Startup",
    narrative: "The idea has been living in your head for three years. You finally have enough experience and connections to try. Starting means leaving security behind. Staying means wondering forever.",
    choices: [
      { icon: "🚀", label: "Quit. Build it now.", sub: "Pure risk. You're finally ready.", effect: { wealth: -15000, reputation: 12, happiness: 18 }, grantsTag: "Entrepreneur", risky: true },
      { icon: "🌙", label: "Build it on the side first", sub: "Slower but you keep your income.", effect: { wealth: -5000, happiness: 12, health: -8, reputation: 8 }, grantsTag: "Entrepreneur" },
      { icon: "📋", label: "Plan it properly for two more years", sub: "Patience is a strategy.", effect: { education: 10, happiness: -4, wealth: 8000 } },
    ],
    requiredAnyTags: ["Entrepreneur", "Hustler", "Investor"],
  },
  {
    id: "ad_politics", ageMin: 30, ageMax: 42,
    title: "The Platform",
    narrative: "People are asking you to run for local office. You have the following, the credibility, the anger about what's broken. Politics is a machine that changes everyone it touches. Do you enter it?",
    choices: [
      { icon: "🏛️", label: "Run. Fight from inside.", sub: "Power costs everything. You accept that.", effect: { reputation: 28, happiness: -8, wealth: -10000, morality: -5 }, grantsTag: "Politician" },
      { icon: "📣", label: "Campaign for others instead", sub: "Your energy without the spotlight.", effect: { reputation: 18, happiness: 12, morality: 8 }, grantsTag: "Activist" },
      { icon: "🚶", label: "Stay out of it entirely", sub: "Clean. Quiet. Not your war.", effect: { happiness: 8, health: 6 } },
    ],
    requiredAnyTags: ["Leader", "Activist", "Social", "Politician"],
  },
  {
    id: "ad_health_wake", ageMin: 30, ageMax: 45,
    title: "The Warning",
    narrative: "A doctor's visit you almost cancelled reveals something. It's not critical yet — but it could become critical. You've been running on fumes for years. This is the signal.",
    choices: [
      { icon: "💪", label: "Complete lifestyle overhaul", sub: "Hard reset. You mean it this time.", effect: { health: 25, fitness: 20, happiness: 10, wealth: -3000 } },
      { icon: "💊", label: "Medication and carry on", sub: "Managed. Not solved.", effect: { health: 12, wealth: -2000 } },
      { icon: "🙈", label: "Ignore it. You're too busy.", sub: "The body keeps the score.", effect: { health: -18, happiness: -6 }, risky: true },
    ],
  },
  {
    id: "ad_mentor", ageMin: 32, ageMax: 44,
    title: "The Young One",
    narrative: "A younger person at work or in your community reminds you of who you were. Raw potential, visible struggle, no one to guide them. You have exactly what they need.",
    choices: [
      { icon: "🧭", label: "Take them under your wing", sub: "Time cost. Deep reward.", effect: { reputation: 16, happiness: 14, morality: 12 }, grantsTag: "Mentor" },
      { icon: "📢", label: "Recommend them without committing", sub: "Help without the burden.", effect: { reputation: 8, happiness: 6, morality: 6 } },
      { icon: "🚶", label: "You're too stretched to help", sub: "Fair. You're human.", effect: { happiness: -4 } },
    ],
  },
  {
    id: "ad_corruption_offer", ageMin: 30, ageMax: 45,
    title: "The Envelope",
    narrative: "An official you work with slides something across the table. It's not the first time you've seen this in your world — but it's the first time it's directed at you. The number is significant.",
    choices: [
      { icon: "🚫", label: "Refuse. Record the meeting.", sub: "You will pay for this. You're at peace with it.", effect: { morality: 20, reputation: 12, wealth: -5000, happiness: -6 }, grantsTag: "Activist" },
      { icon: "🤐", label: "Refuse quietly. Walk away.", sub: "Nothing gained. Nothing lost.", effect: { morality: 12, happiness: -4 } },
      { icon: "✅", label: "Take it. No one will ever know.", sub: "One compromise always leads to another.", effect: { wealth: 30000, morality: -22, reputation: -5 }, grantsTag: "Corrupt", risky: true },
    ],
    requiredAnyTags: ["Politician", "Lawyer", "Doctor", "Leader"],
  },
  {
    id: "ad_family_cost", ageMin: 32, ageMax: 44,
    title: "The Fracture",
    narrative: "Your relationship is at a breaking point. The pressure of work, money, and different visions of the future have created a distance that's become a wall. Something has to change.",
    choices: [
      { icon: "❤️", label: "Fight for it. Therapy. Work.", sub: "Hardest thing you've ever done.", effect: { happiness: 15, health: 8, wealth: -5000 }, grantsTag: "Family" },
      { icon: "🚪", label: "Part ways. Honour what was.", sub: "Painful but honest.", effect: { happiness: -12, wealth: -15000, health: -6 } },
      { icon: "🎭", label: "Maintain the surface. Nothing changes.", sub: "A quiet, slow disaster.", effect: { happiness: -15, health: -10, morality: -5 } },
    ],
    requiredAnyTags: ["Family"],
  },
  {
    id: "ad_community", ageMin: 35, ageMax: 47,
    title: "The Project",
    narrative: "Your community has a problem that no one is solving. Resources exist but not the will. You have both the credibility and the network to lead something real. Nobody asked. You'd have to volunteer.",
    choices: [
      { icon: "🏗️", label: "Take it on. Build something lasting.", sub: "The most important work you'll do.", effect: { reputation: 22, happiness: 18, morality: 15, wealth: -8000 }, grantsTag: "Mentor" },
      { icon: "💸", label: "Fund it. Let others lead.", sub: "Money solves a lot.", effect: { reputation: 14, morality: 10, wealth: -10000 }, grantsTag: "Investor" },
      { icon: "📋", label: "Advise without committing", sub: "Your knowledge helps without your time.", effect: { reputation: 8, happiness: 6 } },
    ],
  },

  // ── MID-LIFE (48–62) ─────────────────────────────────────────────────────

  {
    id: "ml_pivot", ageMin: 48, ageMax: 55,
    title: "The Question",
    narrative: "At 50, something shifts. You are successful by some measure. But the question arrives quietly: is this the life you chose, or the life that happened to you? You still have time. The question is whether you'll use it.",
    choices: [
      { icon: "🔄", label: "Reinvent. Change everything.", sub: "Terrifying. Alive.", effect: { happiness: 20, health: 10, wealth: -12000, reputation: -5 }, grantsTag: "Risk_Taker" },
      { icon: "🔬", label: "Go deeper in what you do best", sub: "Mastery has no ceiling.", effect: { education: 15, reputation: 18, happiness: 12 }, grantsTag: "Visionary" },
      { icon: "🧘", label: "Slow down. Recover. Reflect.", sub: "The most radical act at this point.", effect: { health: 18, happiness: 16, fitness: 12, wealth: -3000 }, grantsTag: "Philosopher" },
    ],
  },
  {
    id: "ml_mentor_legacy", ageMin: 48, ageMax: 60,
    title: "Passing It On",
    narrative: "You have accumulated something — knowledge, experience, networks, insight. A generation below you is hungry. The question is not what to give them, but how much and on whose terms.",
    choices: [
      { icon: "🏛️", label: "Build a formal institution", sub: "Permanent. Outlasts you.", effect: { reputation: 25, morality: 18, wealth: -20000, happiness: 18 }, grantsTag: "Mentor" },
      { icon: "🤝", label: "One-on-one. Deep relationships.", sub: "Personal. Impactful. Intimate.", effect: { reputation: 16, happiness: 20, morality: 14 }, grantsTag: "Mentor" },
      { icon: "📚", label: "Write it all down", sub: "A book that outlives you.", effect: { reputation: 18, education: 10, happiness: 12 }, grantsTag: "Philosopher" },
    ],
  },
  {
    id: "ml_wealth_question", ageMin: 48, ageMax: 60,
    title: "What Wealth Means Now",
    narrative: "The money is there — or it isn't. Either way, you are forced to answer what it's actually for. You have a window to decide what your resources do for the world while you're still here to see it.",
    choices: [
      { icon: "🌍", label: "Major philanthropic commitment", sub: "Your name on something lasting.", effect: { reputation: 30, morality: 22, wealth: -25000, happiness: 18 } },
      { icon: "👨‍👩‍👧", label: "Secure your family's future", sub: "The most primal legacy.", effect: { happiness: 18, morality: 12, wealth: -15000 }, grantsTag: "Family" },
      { icon: "📈", label: "Double it first, then decide", sub: "The pragmatic delay.", effect: { wealth: 40000, happiness: 5, reputation: 5 }, grantsTag: "Investor" },
    ],
  },
  {
    id: "ml_health_reckoning", ageMin: 50, ageMax: 62,
    title: "The Body's Invoice",
    narrative: "Decades of choices — food, stress, sleep, movement — are presenting their accounting. The body doesn't lie. You have more years ahead than behind. How you treat this matters enormously.",
    choices: [
      { icon: "🏃", label: "Radical commitment to health", sub: "Not a phase — a new life.", effect: { health: 28, fitness: 22, happiness: 15, wealth: -5000 } },
      { icon: "🌿", label: "Sustainable changes only", sub: "Small steps that stick.", effect: { health: 16, fitness: 10, happiness: 10 } },
      { icon: "🎉", label: "Live and enjoy what's left", sub: "Philosophical. Shorter.", effect: { happiness: 14, health: -12 }, risky: true },
    ],
  },
  {
    id: "ml_reconcile", ageMin: 50, ageMax: 62,
    title: "The Call",
    narrative: "Someone from your past — a parent, a sibling, an old friend — reaches out after years of silence. The wound is old. The invitation is real. It costs something either way.",
    choices: [
      { icon: "🤝", label: "Accept. Rebuild what you can.", sub: "Heavy. Worth carrying.", effect: { happiness: 18, morality: 14, health: 8 }, grantsTag: "Family" },
      { icon: "✉️", label: "Respond but keep your distance", sub: "Boundaries and honesty together.", effect: { happiness: 10, morality: 8 } },
      { icon: "🚫", label: "Leave the past where it is", sub: "Some wounds should stay closed.", effect: { morality: -6, happiness: -8, health: -4 } },
    ],
  },

  // ── ELDER (63+) ──────────────────────────────────────────────────────────

  {
    id: "el_time", ageMin: 63, ageMax: 75,
    title: "The Reckoning",
    narrative: "At 65, the noise of ambition quiets. What remains is what was always real. You see now, with absolute clarity, what mattered and what didn't. The question is what you do with that clarity while time remains.",
    choices: [
      { icon: "✍️", label: "Document everything — memoir, archive", sub: "Your truth, preserved.", effect: { reputation: 20, happiness: 16, education: 10 }, grantsTag: "Philosopher" },
      { icon: "🌱", label: "Pour energy into the next generation", sub: "The only real immortality.", effect: { morality: 20, happiness: 22, reputation: 15 }, grantsTag: "Mentor" },
      { icon: "🛤️", label: "Take the journey you never took", sub: "The world waited. So can regret.", effect: { happiness: 24, health: 10, wealth: -8000 }, grantsTag: "Traveler" },
    ],
  },
  {
    id: "el_meaning", ageMin: 65, ageMax: 80,
    title: "The Only Question",
    narrative: "Time has taught you that most of what seemed urgent was not. And that some things you dismissed entirely were everything. You have lived. The question of meaning doesn't get easier. It gets clearer.",
    choices: [
      { icon: "🕊️", label: "Peace with what you couldn't control", sub: "Release. The deepest freedom.", effect: { happiness: 25, health: 12, morality: 15 }, grantsTag: "Philosopher" },
      { icon: "💥", label: "Rage against the limitations", sub: "Alive until the very end.", effect: { happiness: 15, health: 8, reputation: 10 }, grantsTag: "Rebel" },
      { icon: "🎁", label: "Give away everything that remains", sub: "The final act of legacy.", effect: { morality: 25, reputation: 20, happiness: 20, wealth: -20000 }, grantsTag: "Mentor" },
    ],
  },
  {
    id: "el_community_final", ageMin: 68, ageMax: 999,
    title: "Still Here",
    narrative: "You are still here. Still deciding. Still mattering. The community that formed around your life needs one more thing from you — and you are capable of giving it.",
    choices: [
      { icon: "🏛️", label: "Fund or found one last institution", sub: "Your name becomes a foundation.", effect: { reputation: 25, morality: 20, happiness: 18, wealth: -15000 } },
      { icon: "📖", label: "Tell your story publicly", sub: "Thousands will be changed by it.", effect: { reputation: 22, happiness: 20, morality: 12 }, grantsTag: "Philosopher" },
      { icon: "🌱", label: "Spend your time with young people", sub: "Living, not archiving.", effect: { happiness: 24, morality: 18, health: 6 }, grantsTag: "Mentor" },
    ],
  },
  {
    id: "el_infinite", ageMin: 75, ageMax: 999,
    title: "The Continuing Life",
    narrative: "Decades beyond when you thought you'd slow down, life keeps presenting decisions. Every moment that remains is compounded legacy. You are the product of every choice you ever made, and you're still making them.",
    choices: [
      { icon: "🔬", label: "Pursue one final ambitious project", sub: "Why not? You always have.", effect: { reputation: 18, happiness: 18, education: 10, health: -5 }, grantsTag: "Visionary" },
      { icon: "🤲", label: "Complete surrender to service", sub: "Pure. Selfless. Final.", effect: { morality: 22, happiness: 22, reputation: 16 }, grantsTag: "Mentor" },
      { icon: "🌅", label: "Deep presence. Every remaining day.", sub: "The life examined becomes the life worth living.", effect: { happiness: 28, health: 10, morality: 16 }, grantsTag: "Philosopher" },
    ],
  },

];

// ─── Random Events ────────────────────────────────────────────────────────────

const RANDOM_EVENTS: RandomEvent[] = [
  { title: "Serious Illness",      text: "Hospitalised for weeks. Recovery was slow and costly.",           icon: "🏥", effect: { health: -18, wealth: -5000, happiness: -10 }, type: "bad"     },
  { title: "Fitness Breakthrough", text: "90-day challenge completed. You feel genuinely different.",       icon: "💪", effect: { health: 18, fitness: 15, happiness: 12 },       type: "good"    },
  { title: "Unexpected Windfall",  text: "A distant relative passed and left you something real.",          icon: "💰", effect: { wealth: 18000, happiness: 10 },                  type: "good"    },
  { title: "Investment Explodes",  text: "A stock you forgot about surged overnight.",                      icon: "📈", effect: { wealth: 40000, happiness: 15 },                  type: "good"    },
  { title: "Scammed",              text: "An elaborate fraud cost you months of savings.",                  icon: "😱", effect: { wealth: -10000, happiness: -14 },                type: "bad"     },
  { title: "Market Crash",         text: "Global recession. Your portfolio took a serious hit.",            icon: "📉", effect: { wealth: -20000, happiness: -12 },                type: "bad"     },
  { title: "Viral Recognition",    text: "Something you did or said spread globally. You are known.",      icon: "📱", effect: { reputation: 20, happiness: 14 },                  type: "good"    },
  { title: "Public Scandal",       text: "A private matter became very public. Damage done.",              icon: "😤", effect: { reputation: -20, happiness: -15 },               type: "bad"     },
  { title: "Road Accident",        text: "A collision. Months of recovery. Life recontextualised.",        icon: "🚑", effect: { health: -22, wealth: -8000 },                     type: "bad"     },
  { title: "Unexpected Promotion", text: "Your contributions were finally seen and rewarded.",             icon: "🏆", effect: { wealth: 15000, reputation: 14, happiness: 12 },  type: "good"    },
  { title: "Dream Collaboration",  text: "You were hand-picked for something you've wanted for years.",   icon: "⭐", effect: { reputation: 16, happiness: 15, education: 8 },    type: "good"    },
  { title: "Natural Disaster",     text: "Your region was struck. Recovery took years.",                   icon: "🌪️", effect: { wealth: -15000, health: -10, happiness: -12 },  type: "bad"     },
  { title: "National Honour",      text: "Formally recognised for your contribution to society.",          icon: "🎖️", effect: { reputation: 25, happiness: 18 },                  type: "good"    },
  { title: "Mental Health Reset",  text: "Therapy and serious work transformed your baseline.",            icon: "🧘", effect: { happiness: 22, health: 12 },                       type: "good"    },
  { title: "Betrayed",             text: "Someone you trusted completely let you down.",                   icon: "🗡️", effect: { happiness: -16, reputation: -8 },                type: "bad"     },
  { title: "Emigrated Successfully",text:"You moved abroad and found the upgrade you were seeking.",       icon: "🌍", effect: { wealth: 20000, happiness: 16, reputation: 8 },    type: "good"    },
];

// ─── Game Engine ──────────────────────────────────────────────────────────────

function computeLegacyScore(state: GameState): number {
  const { stats, tags, age } = state;
  let score = 0;
  score += Math.max(0, stats.health) * 0.8;
  score += Math.max(0, stats.education) * 1.2;
  score += Math.max(0, stats.happiness) * 1.0;
  score += Math.max(0, stats.reputation) * 1.5;
  score += Math.max(0, stats.fitness) * 0.6;
  score += Math.max(0, stats.morality) * 0.9;
  score += Math.min(Math.log10(Math.max(stats.wealth, 1)) * 22, 200);
  score += Math.min(age, 85) * 2.2;
  const bonusTags: Partial<Record<Tag, number>> = {
    Scholar: 30, Leader: 40, Mentor: 55, Visionary: 45, Activist: 35,
    Doctor: 40, Lawyer: 30, Entrepreneur: 35, Philosopher: 30, Investor: 25,
    Family: 25, Graduate: 20, Survivor: 20, Strategist: 20,
  };
  tags.forEach(t => { score += (bonusTags[t] ?? 0); });
  return Math.max(0, Math.round(score));
}

function pickScene(state: GameState): Scene | null {
  const { age, tags, scenesSeen, playerId } = state;
  const eligible = SCENE_POOL.filter(scene => {
    if (age < scene.ageMin || age > scene.ageMax) return false;
    if (scenesSeen.includes(scene.id)) return false;
    if (scene.requiredAnyTags?.length) {
      if (!scene.requiredAnyTags.some(t => tags.includes(t))) return false;
    }
    if (scene.blockedTags?.some(t => tags.includes(t))) return false;
    return true;
  });
  if (eligible.length === 0) {
    // Fallback: pick any unseen scene for current age, ignoring tag requirements
    const fallback = SCENE_POOL.filter(s =>
      age >= s.ageMin && age <= s.ageMax && !scenesSeen.includes(s.id)
    );
    if (fallback.length === 0) {
      // All scenes for this age exhausted — pick closest age range
      const any = SCENE_POOL.filter(s =>
        Math.abs((s.ageMin + s.ageMax) / 2 - age) < 20
      );
      if (any.length === 0) return SCENE_POOL[SCENE_POOL.length - 1];
      const rng = seededRng(`${playerId}-fallback-${age}-${scenesSeen.length}`);
      return any[Math.floor(rng() * any.length)];
    }
    const rng = seededRng(`${playerId}-fb2-${age}-${scenesSeen.length}`);
    return fallback[Math.floor(rng() * fallback.length)];
  }
  const rng = seededRng(`${playerId}-${age}-${scenesSeen.length}-${tags.sort().join("")}`);
  return eligible[Math.floor(rng() * eligible.length)];
}

function filterChoices(choices: Choice[], tags: Tag[]): Choice[] {
  return choices.filter(c => {
    if (c.requiredTags?.length && !c.requiredTags.some(t => tags.includes(t))) return false;
    if (c.blockedTags?.some(t => tags.includes(t))) return false;
    return true;
  });
}

function applyEffect(stats: Stats, effect: Partial<Stats>): Stats {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  return {
    health:     effect.health     !== undefined ? clamp(stats.health + effect.health)         : stats.health,
    education:  effect.education  !== undefined ? clamp(stats.education + effect.education)   : stats.education,
    happiness:  effect.happiness  !== undefined ? clamp(stats.happiness + effect.happiness)   : stats.happiness,
    fitness:    effect.fitness    !== undefined ? clamp(stats.fitness + effect.fitness)       : stats.fitness,
    reputation: effect.reputation !== undefined ? clamp(stats.reputation + effect.reputation) : stats.reputation,
    morality:   effect.morality   !== undefined ? clamp(stats.morality + effect.morality)     : stats.morality,
    wealth:     effect.wealth     !== undefined ? Math.max(0, stats.wealth + effect.wealth)   : stats.wealth,
  };
}

function getAgeJump(age: number): number {
  if (age < 4) return 2;
  if (age < 13) return 2;
  if (age < 18) return 1;
  if (age < 28) return 2;
  if (age < 48) return 3;
  if (age < 63) return 4;
  return 5;
}

function getPhaseGradient(age: number): [string, string] {
  if (age < 4) return ["#7c3aed", "#9d4edd"];
  if (age < 13) return ["#0e7490", "#0891b2"];
  if (age < 18) return ["#b45309", "#d97706"];
  if (age < 28) return ["#be185d", "#db2777"];
  if (age < 48) return ["#1e40af", "#2563eb"];
  if (age < 63) return ["#374151", "#6b7280"];
  return ["#92400e", "#d97706"];
}

function getPhaseName(age: number): string {
  if (age < 4)  return "INFANCY";
  if (age < 13) return "CHILDHOOD";
  if (age < 18) return "ADOLESCENCE";
  if (age < 28) return "YOUNG ADULT";
  if (age < 48) return "ADULTHOOD";
  if (age < 63) return "MID-LIFE";
  return "LEGACY";
}

function shouldTriggerEvent(age: number, rng: () => number): boolean {
  return rng() < 0.35;
}

function pickEvent(playerId: string, age: number): RandomEvent {
  return seededPick(RANDOM_EVENTS, `${playerId}-ev-${age}`);
}

function makeBirthState(userId: string): Omit<GameState, "playerId"> {
  const rng = seededRng(`birth-${userId}`);
  const country = COUNTRIES[Math.floor(rng() * COUNTRIES.length)];
  const family = FAMILIES[Math.floor(rng() * FAMILIES.length)];
  const initialWealth = family.wealth * country.wealthMod;
  return {
    age: 0,
    stats: {
      health: 50 + Math.floor(rng() * 20),
      education: 10,
      happiness: 50 + Math.floor(rng() * 20),
      wealth: initialWealth,
      reputation: 10,
      fitness: 40 + Math.floor(rng() * 20),
      morality: 50 + Math.floor(rng() * 20),
    },
    tags: [],
    career: null,
    country: country.name,
    flag: country.flag,
    familyClass: family.label,
    birthYear: 2024 - 1,
    scenesSeen: [],
    log: [],
    legacyScore: 0,
    pendingEvent: null,
  };
}

// ─── Supabase Persistence ─────────────────────────────────────────────────────

async function loadSave(userId: string): Promise<GameState | null> {
  const { data, error } = await supabase
    .from("life_earth_saves")
    .select("state, legacy_score, current_age, career, country, family_class")
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  const s = data.state as Partial<GameState>;
  return {
    playerId: userId,
    age: data.current_age ?? 0,
    stats: s.stats ?? { health: 50, education: 10, happiness: 50, wealth: 5000, reputation: 10, fitness: 40, morality: 50 },
    tags: s.tags ?? [],
    career: data.career ?? null,
    country: data.country ?? "Unknown",
    flag: s.flag ?? "🌍",
    familyClass: data.family_class ?? "Working Class",
    birthYear: s.birthYear ?? 2023,
    scenesSeen: s.scenesSeen ?? [],
    log: s.log ?? [],
    legacyScore: data.legacy_score ?? 0,
    pendingEvent: s.pendingEvent ?? null,
  };
}

async function persistSave(state: GameState): Promise<void> {
  const score = computeLegacyScore(state);
  await supabase.from("life_earth_saves").upsert({
    user_id: state.playerId,
    state: state as unknown as Record<string, unknown>,
    legacy_score: score,
    current_age: state.age,
    career: state.career,
    country: state.country,
    family_class: state.familyClass,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

async function loadLeaderboard() {
  const { data } = await supabase
    .from("life_earth_leaderboard")
    .select("handle, display_name, avatar_url, legacy_score, current_age, career, country")
    .order("legacy_score", { ascending: false })
    .limit(50);
  return data ?? [];
}

// ─── Stat Formatting ──────────────────────────────────────────────────────────

function fmtWealth(w: number): string {
  if (w >= 1_000_000) return `$${(w / 1_000_000).toFixed(1)}M`;
  if (w >= 1_000) return `$${(w / 1_000).toFixed(0)}K`;
  return `$${Math.floor(w)}`;
}


// ─── Main Component ───────────────────────────────────────────────────────────

export default function LifeSimGame() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [uiPhase, setUiPhase] = useState<UiPhase>("loading");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [filteredChoices, setFilteredChoices] = useState<Choice[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{ icon: string; text: string; good: boolean } | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const resultAnim = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 9, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const saved = await loadSave(user.id);
      if (saved) {
        setGameState(saved);
        const scene = pickScene(saved);
        setCurrentScene(scene);
        if (scene) setFilteredChoices(filterChoices(scene.choices, saved.tags));
        if (saved.pendingEvent) {
          setUiPhase("event");
        } else {
          setUiPhase("playing");
          animateIn();
        }
      } else {
        const birth = makeBirthState(user.id);
        const state: GameState = { playerId: user.id, ...birth };
        setGameState(state);
        setUiPhase("birth");
      }
    })();
  }, [user?.id]);

  // ── Begin Life (from birth screen) ────────────────────────────────────────

  const beginLife = useCallback(async () => {
    if (!gameState) return;
    Haptics.impactAsync?.();
    const scene = pickScene(gameState);
    setCurrentScene(scene);
    if (scene) setFilteredChoices(filterChoices(scene.choices, gameState.tags));
    setUiPhase("playing");
    animateIn();
    await persistSave(gameState);
  }, [gameState, animateIn]);

  // ── Make a Choice ─────────────────────────────────────────────────────────

  const makeChoice = useCallback(async (choice: Choice) => {
    if (!gameState) return;
    Haptics.impactAsync?.();

    const ageJump = getAgeJump(gameState.age);
    const newAge = gameState.age + ageJump;
    const newStats = applyEffect(gameState.stats, choice.effect);
    const newTags = choice.grantsTag && !gameState.tags.includes(choice.grantsTag)
      ? [...gameState.tags, choice.grantsTag]
      : gameState.tags;

    const newLog: LogEntry[] = [
      ...gameState.log.slice(-24),
      { age: gameState.age, text: `${choice.label} — ${choice.sub}`, icon: choice.icon },
    ];

    // Check for random event
    const eventRng = seededRng(`${gameState.playerId}-eventtrigger-${newAge}`);
    const hasEvent = shouldTriggerEvent(newAge, eventRng);
    const pendingEvent = hasEvent ? pickEvent(gameState.playerId, newAge) : null;

    const newState: GameState = {
      ...gameState,
      age: newAge,
      stats: newStats,
      tags: newTags as Tag[],
      scenesSeen: [...gameState.scenesSeen, currentScene?.id ?? ""],
      log: newLog,
      legacyScore: computeLegacyScore({ ...gameState, age: newAge, stats: newStats, tags: newTags as Tag[] }),
      pendingEvent,
    };

    setGameState(newState);

    if (pendingEvent) {
      setUiPhase("event");
    } else {
      const nextScene = pickScene(newState);
      setCurrentScene(nextScene);
      if (nextScene) setFilteredChoices(filterChoices(nextScene.choices, newState.tags));
      animateIn();
    }

    await persistSave(newState);
  }, [gameState, currentScene, animateIn]);

  // ── Dismiss Event ─────────────────────────────────────────────────────────

  const dismissEvent = useCallback(async () => {
    if (!gameState || !gameState.pendingEvent) return;
    const event = gameState.pendingEvent;
    const newStats = applyEffect(gameState.stats, event.effect);
    const newLog: LogEntry[] = [
      ...gameState.log.slice(-24),
      { age: gameState.age, text: event.title + " — " + event.text, icon: event.icon },
    ];
    const newState: GameState = {
      ...gameState,
      stats: newStats,
      log: newLog,
      pendingEvent: null,
      legacyScore: computeLegacyScore({ ...gameState, stats: newStats }),
    };
    setGameState(newState);
    const nextScene = pickScene(newState);
    setCurrentScene(nextScene);
    if (nextScene) setFilteredChoices(filterChoices(nextScene.choices, newState.tags));
    setUiPhase("playing");
    animateIn();
    await persistSave(newState);
  }, [gameState, animateIn]);

  // ── Open Leaderboard ──────────────────────────────────────────────────────

  const openLeaderboard = useCallback(async () => {
    setUiPhase("leaderboard");
    setLbLoading(true);
    const data = await loadLeaderboard();
    setLeaderboard(data);
    setLbLoading(false);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (uiPhase === "loading") {
    return (
      <View style={[cs.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={[cs.loadingText, { marginTop: 16 }]}>Loading your life…</Text>
      </View>
    );
  }

  // ── Birth screen ────────────────────────────────────────────────────────────
  if (uiPhase === "birth" && gameState) {
    const g = getPhaseGradient(0);
    return (
      <View style={cs.root}>
        {/* Hero gradient header */}
        <LinearGradient
          colors={[g[0] + "cc", g[1] + "66", "transparent"]}
          style={[cs.birthHero, { paddingTop: insets.top + 16 }]}
        >
          <Text style={cs.birthHeroFlag}>{gameState.flag}</Text>
          <Text style={cs.birthHeroCountry}>{gameState.country}</Text>
          <View style={cs.birthPhasePill}>
            <Text style={cs.birthPhasePillText}>LIFE EARTH</Text>
          </View>
        </LinearGradient>

        {/* Info cards */}
        <View style={cs.birthCards}>
          <View style={cs.birthCard}>
            <View style={[cs.birthCardIcon, { backgroundColor: "#3b82f620" }]}>
              <Text style={{ fontSize: 18 }}>🏠</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={cs.birthCardLabel}>FAMILY</Text>
              <Text style={cs.birthCardVal}>{gameState.familyClass}</Text>
            </View>
          </View>
          <View style={cs.birthCard}>
            <View style={[cs.birthCardIcon, { backgroundColor: "#10b98120" }]}>
              <Text style={{ fontSize: 18 }}>💰</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={cs.birthCardLabel}>STARTING WEALTH</Text>
              <Text style={cs.birthCardVal}>{fmtWealth(gameState.stats.wealth)}</Text>
            </View>
          </View>
          <View style={cs.birthCard}>
            <View style={[cs.birthCardIcon, { backgroundColor: "#a78bfa20" }]}>
              <Text style={{ fontSize: 18 }}>🎲</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={cs.birthCardLabel}>YOUR PATH</Text>
              <Text style={cs.birthCardVal}>Unique — seeded to you</Text>
            </View>
          </View>
        </View>

        {/* Feature pills */}
        <View style={cs.birthFeatures}>
          {[
            { icon: "🔀", label: "Branching choices" },
            { icon: "♾️", label: "Endless gameplay" },
            { icon: "🏆", label: "Live rankings" },
          ].map(f => (
            <View key={f.label} style={cs.birthFeaturePill}>
              <Text style={cs.birthFeatureIcon}>{f.icon}</Text>
              <Text style={cs.birthFeatureText}>{f.label}</Text>
            </View>
          ))}
        </View>

        {/* CTA pinned to bottom */}
        <View style={[cs.birthBottom, { paddingBottom: insets.bottom + 20 }]}>
          <Pressable
            onPress={() => { Haptics.impactAsync?.(); beginLife(); }}
            style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }] }]}
          >
            <LinearGradient colors={g} style={cs.beginPill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={cs.beginPillText}>Begin Your Life</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Life event screen ────────────────────────────────────────────────────────
  if (uiPhase === "event" && gameState?.pendingEvent) {
    const ev = gameState.pendingEvent;
    const good = ev.type === "good";
    const accentColor = good ? "#10b981" : "#ef4444";
    const statIcons: Record<string, string> = {
      health: "❤️", education: "📚", happiness: "😊",
      fitness: "💪", reputation: "⭐", wealth: "💰", morality: "⚖️",
    };
    return (
      <View style={cs.root}>
        <LinearGradient
          colors={[accentColor + "22", "transparent"]}
          style={[cs.evHero, { paddingTop: insets.top + 24 }]}
        >
          <View style={[cs.evTypeBadge, { backgroundColor: accentColor + "25", borderColor: accentColor + "50" }]}>
            <Text style={[cs.evTypeBadgeText, { color: accentColor }]}>
              {good ? "FORTUNE" : "ADVERSITY"}
            </Text>
          </View>
          <Text style={cs.evIcon}>{ev.icon}</Text>
          <Text style={cs.evTitle}>{ev.title}</Text>
        </LinearGradient>

        <View style={cs.evEffectsWrap}>
          {Object.entries(ev.effect).map(([k, v]) => {
            const val = v as number;
            const pos = val > 0;
            return (
              <View key={k} style={[cs.evChip, {
                backgroundColor: pos ? "#10b98115" : "#ef444415",
                borderColor: pos ? "#10b98140" : "#ef444440",
              }]}>
                <Text style={{ fontSize: 14 }}>{statIcons[k] ?? "•"}</Text>
                <Text style={[cs.evChipText, { color: pos ? "#34d399" : "#f87171" }]}>
                  {pos ? "+" : ""}{k === "wealth" ? fmtWealth(val) : val}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={[cs.evBottom, { paddingBottom: insets.bottom + 20 }]}>
          <Pressable
            onPress={() => { Haptics.impactAsync?.(); dismissEvent(); }}
            style={({ pressed }) => [cs.evCTA, { backgroundColor: accentColor, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
          >
            <Text style={cs.evCTAText}>Continue</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Leaderboard screen ───────────────────────────────────────────────────────
  if (uiPhase === "leaderboard") {
    return (
      <View style={cs.root}>
        {/* Header */}
        <View style={[cs.lbHeader, { paddingTop: insets.top + 14 }]}>
          <Pressable
            onPress={() => setUiPhase("playing")}
            style={cs.lbCloseBtn}
            hitSlop={12}
          >
            <Ionicons name="close" size={18} color="#94a3b8" />
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={cs.lbHeadTitle}>Leaderboard</Text>
            <Text style={cs.lbHeadSub}>Global Legacy Scores</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {lbLoading ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color="#3b82f6" size="large" />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {/* Your score card */}
            {gameState && (
              <View style={cs.lbYouCard}>
                <View style={cs.lbYouAvatar}>
                  <Text style={{ fontSize: 18 }}>🌍</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={cs.lbYouName}>You · Age {gameState.age}</Text>
                  <Text style={cs.lbYouCareer}>{gameState.career ?? "No career yet"}</Text>
                </View>
                <Text style={cs.lbYouScore}>{computeLegacyScore(gameState).toLocaleString()}</Text>
              </View>
            )}

            {/* Divider */}
            <View style={cs.lbDivider}>
              <Text style={cs.lbDividerText}>ALL PLAYERS</Text>
            </View>

            {leaderboard.length === 0 ? (
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 10 }}>
                <Text style={{ fontSize: 36 }}>🌍</Text>
                <Text style={cs.lbEmpty}>No scores yet — be first.</Text>
              </View>
            ) : leaderboard.slice(0, 15).map((e, i) => {
              const medal = i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              const rankColor = i === 0 ? "#f59e0b" : i === 1 ? "#cbd5e1" : i === 2 ? "#cd7c2f" : "#475569";
              return (
                <View key={i} style={[cs.lbRow, i < 3 && { backgroundColor: rankColor + "10" }]}>
                  <View style={[cs.lbRankBadge, { backgroundColor: rankColor + "20" }]}>
                    {medal
                      ? <Text style={{ fontSize: 14 }}>{medal}</Text>
                      : <Text style={[cs.lbRankNum, { color: rankColor }]}>#{i + 1}</Text>
                    }
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={cs.lbName} numberOfLines={1}>{e.display_name || e.handle || "Anonymous"}</Text>
                    <Text style={cs.lbMeta} numberOfLines={1}>{e.career ?? "—"} · {e.country ?? "—"}</Text>
                  </View>
                  <Text style={[cs.lbScore, { color: i < 3 ? rankColor : "#e2e8f0" }]}>
                    {(e.legacy_score ?? 0).toLocaleString()}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  }

  // ── Main game view ───────────────────────────────────────────────────────────
  if (!gameState || !currentScene) return null;

  const gradient = getPhaseGradient(gameState.age);
  const phaseName = getPhaseName(gameState.age);
  const score = computeLegacyScore(gameState);
  const statRows = [
    { icon: "❤️", v: gameState.stats.health,    c: "#f87171", label: "Health" },
    { icon: "📚", v: gameState.stats.education,  c: "#60a5fa", label: "Edu" },
    { icon: "😊", v: gameState.stats.happiness,  c: "#fbbf24", label: "Joy" },
    { icon: "💪", v: gameState.stats.fitness,    c: "#34d399", label: "Fit" },
    { icon: "⭐", v: gameState.stats.reputation, c: "#a78bfa", label: "Rep" },
    { icon: "💰", v: Math.min(100, Math.max(0, gameState.stats.wealth / 500)), c: "#86efac", label: "Wealth", display: fmtWealth(gameState.stats.wealth) },
  ];

  return (
    <View style={cs.root}>

      {/* ── Gradient hero header ── */}
      <LinearGradient
        colors={[gradient[0] + "ee", gradient[0] + "66", "transparent"]}
        style={[cs.gameHeader, { paddingTop: insets.top + 10 }]}
      >
        <View style={cs.gameHeaderLeft}>
          <Text style={cs.gameHeaderAge}>{gameState.age}</Text>
          <Text style={cs.gameHeaderAgeLabel}>years old</Text>
        </View>
        <View style={cs.gameHeaderCenter}>
          <View style={[cs.phasePill, { borderColor: gradient[1] + "60" }]}>
            <View style={[cs.phaseDot, { backgroundColor: gradient[1] }]} />
            <Text style={[cs.phaseLabel, { color: gradient[1] }]}>{phaseName.toUpperCase()}</Text>
          </View>
        </View>
        <Pressable
          style={cs.gameHeaderScore}
          onPress={() => { Haptics.impactAsync?.(); openLeaderboard(); }}
          hitSlop={8}
        >
          <Text style={cs.gameHeaderScoreNum}>{score.toLocaleString()}</Text>
          <Text style={cs.gameHeaderScoreLabel}>🏆 LEGACY</Text>
        </Pressable>
      </LinearGradient>

      {/* ── Stats grid ── */}
      <View style={cs.statsGrid}>
        {statRows.map(s => (
          <View key={s.label} style={cs.statCell}>
            <View style={cs.statCellTop}>
              <Text style={cs.statCellIcon}>{s.icon}</Text>
              <Text style={[cs.statCellVal, { color: s.c }]}>
                {s.display ?? Math.round(s.v)}
              </Text>
            </View>
            <View style={cs.statBarTrack}>
              <View style={[cs.statBarFill, {
                width: `${Math.min(100, Math.max(1, s.v))}%`,
                backgroundColor: s.c,
              }]} />
            </View>
          </View>
        ))}
      </View>

      {/* ── Age progress strip ── */}
      <View style={cs.ageTrack}>
        <View style={[cs.ageFill, {
          width: `${Math.min(100, (gameState.age / 85) * 100)}%`,
          backgroundColor: gradient[0],
        }]} />
      </View>

      {/* ── Situation card ── */}
      <Animated.View style={[cs.cardWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={[cs.situationCard, { borderColor: gradient[0] + "50" }]}>
          <LinearGradient
            colors={[gradient[0] + "30", gradient[0] + "08"]}
            style={cs.situationCardGrad}
          >
            <View style={cs.situationMeta}>
              <View style={[cs.situationAgePill, { backgroundColor: gradient[0] + "40", borderColor: gradient[1] + "50" }]}>
                <Text style={[cs.situationAgeText, { color: gradient[1] }]}>AGE {gameState.age}</Text>
              </View>
              <Text style={[cs.situationPhaseText, { color: gradient[1] + "aa" }]}>{phaseName.toUpperCase()}</Text>
            </View>
            <Text style={cs.situationTitle}>{currentScene.title}</Text>
            <Text style={cs.situationBody}>{currentScene.narrative}</Text>
          </LinearGradient>
        </View>
      </Animated.View>

      {/* ── Choice cards ── */}
      <View style={[cs.choicesWrap, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={cs.choicesHeading}>WHAT DO YOU DO?</Text>
        {filteredChoices.slice(0, 4).map((c, i) => (
          <Pressable
            key={i}
            onPress={() => { Haptics.impactAsync?.(); makeChoice(c); }}
            style={({ pressed }) => [
              cs.choiceBtn,
              c.risky && cs.choiceBtnRisky,
              { transform: [{ scale: pressed ? 0.975 : 1 }], opacity: pressed ? 0.82 : 1 },
            ]}
          >
            <View style={[cs.choiceBtnIconWrap, {
              backgroundColor: c.risky ? "#ef444422" : gradient[0] + "30",
              borderColor: c.risky ? "#ef444440" : gradient[0] + "60",
            }]}>
              <Text style={cs.choiceBtnIcon}>{c.icon}</Text>
            </View>
            <View style={cs.choiceBtnText}>
              <View style={cs.choiceBtnLabelRow}>
                <Text style={cs.choiceBtnLabel}>{c.label}</Text>
                {c.risky && (
                  <View style={cs.riskyBadge}><Text style={cs.riskyBadgeText}>RISK</Text></View>
                )}
              </View>
              <Text style={cs.choiceBtnSub} numberOfLines={2}>{c.sub}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={13}
              color={c.risky ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.2)"}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  bg: "#0d1b2a",
  surface: "#162032",
  surfaceHigh: "#1d2d42",
  border: "rgba(255,255,255,0.09)",
  text: "#f1f5f9",
  textMid: "rgba(241,245,249,0.6)",
  textLow: "rgba(241,245,249,0.35)",
};

const cs = StyleSheet.create({
  root: { flex: 1, backgroundColor: S.bg },

  // ── Birth ──
  birthHero: { alignItems: "center", paddingHorizontal: 24, paddingBottom: 20, gap: 6 },
  birthHeroFlag: { fontSize: 52, marginBottom: 4 },
  birthHeroCountry: { fontSize: 26, fontFamily: "Inter_700Bold", color: S.text, textAlign: "center" },
  birthPhasePill: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 100, paddingHorizontal: 14, paddingVertical: 4, marginTop: 4 },
  birthPhasePillText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.7)", letterSpacing: 2 },
  birthCards: { paddingHorizontal: 16, gap: 8, marginTop: 4 },
  birthCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: S.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: S.border },
  birthCardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  birthCardLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: S.textLow, letterSpacing: 0.8 },
  birthCardVal: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: S.text, marginTop: 1 },
  birthFeatures: { flexDirection: "row", justifyContent: "center", gap: 8, paddingHorizontal: 16, marginTop: 12 },
  birthFeaturePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: S.surface, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: S.border },
  birthFeatureIcon: { fontSize: 12 },
  birthFeatureText: { fontSize: 11, fontFamily: "Inter_500Medium", color: S.textMid },
  birthBottom: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 20 },
  beginPill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 100, paddingVertical: 17 },
  beginPillText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },

  // ── Event ──
  evHero: { alignItems: "center", paddingHorizontal: 28, paddingBottom: 16, gap: 10 },
  evTypeBadge: { borderRadius: 100, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 5 },
  evTypeBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  evIcon: { fontSize: 56 },
  evTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: S.text, textAlign: "center", lineHeight: 30 },
  evEffectsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", paddingHorizontal: 24, marginTop: 4 },
  evChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100, borderWidth: 1 },
  evChipText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  evBottom: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 24 },
  evCTA: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 100, paddingVertical: 16 },
  evCTAText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },

  // ── Leaderboard ──
  lbHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: S.border },
  lbCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: S.surface, alignItems: "center", justifyContent: "center" },
  lbHeadTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: S.text },
  lbHeadSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: S.textLow, marginTop: 1 },
  lbYouCard: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginTop: 12, marginBottom: 4, backgroundColor: "rgba(59,130,246,0.1)", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(59,130,246,0.3)" },
  lbYouAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(59,130,246,0.2)", alignItems: "center", justifyContent: "center" },
  lbYouName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#93c5fd" },
  lbYouCareer: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(147,197,253,0.6)", marginTop: 1 },
  lbYouScore: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#60a5fa" },
  lbDivider: { paddingHorizontal: 18, paddingVertical: 10 },
  lbDividerText: { fontSize: 9, fontFamily: "Inter_700Bold", color: S.textLow, letterSpacing: 1.5 },
  lbRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: S.border },
  lbRankBadge: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  lbRankNum: { fontSize: 11, fontFamily: "Inter_700Bold" },
  lbName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: S.text },
  lbMeta: { fontSize: 10, fontFamily: "Inter_400Regular", color: S.textLow, marginTop: 1 },
  lbScore: { fontSize: 16, fontFamily: "Inter_700Bold" },
  lbEmpty: { fontSize: 14, fontFamily: "Inter_400Regular", color: S.textLow },

  // ── Game header ──
  gameHeader: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  gameHeaderLeft: { flex: 1 },
  gameHeaderAge: { fontSize: 40, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 44 },
  gameHeaderAgeLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", letterSpacing: 0.5 },
  gameHeaderCenter: { alignItems: "center", flex: 1 },
  phasePill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 100, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  phaseDot: { width: 6, height: 6, borderRadius: 3 },
  phaseLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
  gameHeaderScore: { flex: 1, alignItems: "flex-end" },
  gameHeaderScoreNum: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fbbf24" },
  gameHeaderScoreLabel: { fontSize: 8, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginTop: 1 },

  // ── Stats ──
  statsGrid: { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 8, gap: 6 },
  statCell: { flex: 1, gap: 3 },
  statCellTop: { flexDirection: "row", alignItems: "center", gap: 3 },
  statCellIcon: { fontSize: 10 },
  statCellVal: { fontSize: 10, fontFamily: "Inter_700Bold" },
  statBarTrack: { height: 2, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 2 },
  statBarFill: { height: 2, borderRadius: 2 },

  // ── Age bar ──
  ageTrack: { height: 2, backgroundColor: "rgba(255,255,255,0.05)" },
  ageFill: { height: 2 },

  // ── Situation card ──
  cardWrap: { flex: 1, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4, justifyContent: "center" },
  situationCard: { borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  situationCardGrad: { padding: 16, gap: 10 },
  situationMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  situationAgePill: { borderRadius: 100, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  situationAgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  situationPhaseText: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  situationTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: S.text, lineHeight: 26 },
  situationBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: S.textMid, lineHeight: 21 },

  // ── Choice cards ──
  choicesWrap: { paddingHorizontal: 14, gap: 5 },
  choicesHeading: { fontSize: 9, fontFamily: "Inter_700Bold", color: S.textLow, letterSpacing: 2, marginBottom: 2 },
  choiceBtn: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: S.surface, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: S.border },
  choiceBtnRisky: { borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.06)" },
  choiceBtnIconWrap: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  choiceBtnIcon: { fontSize: 19 },
  choiceBtnText: { flex: 1, gap: 2 },
  choiceBtnLabelRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  choiceBtnLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: S.text },
  choiceBtnSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: S.textLow, lineHeight: 15 },
  riskyBadge: { backgroundColor: "rgba(239,68,68,0.18)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  riskyBadgeText: { fontSize: 8, fontFamily: "Inter_700Bold", color: "#f87171", letterSpacing: 0.5 },

  // ── Misc ──
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular", color: S.textLow },
});
