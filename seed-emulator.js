#!/usr/bin/env node

import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// Initialize Firebase Admin for emulator
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

const app = initializeApp({
  projectId: "minnesota-winter-league",
});

const firestore = getFirestore(app);
const auth = getAuth(app);

console.log("🌱 Seeding development database...");

// Create test users
async function createTestUsers() {
  const testUsers = [
    {
      uid: "test-captain-1",
      email: "captain1@test.com",
      displayName: "Captain One",
      emailVerified: true,
    },
    {
      uid: "test-captain-2",
      email: "captain2@test.com",
      displayName: "Captain Two",
      emailVerified: true,
    },
    {
      uid: "test-captain-3",
      email: "captain3@test.com",
      displayName: "Captain Three",
      emailVerified: true,
    },
    {
      uid: "test-player-1",
      email: "player1@test.com",
      displayName: "Player One",
      emailVerified: true,
    },
    {
      uid: "test-player-2",
      email: "player2@test.com",
      displayName: "Player Two",
      emailVerified: true,
    },
    {
      uid: "test-player-3",
      email: "player3@test.com",
      displayName: "Player Three",
      emailVerified: true,
    },
    {
      uid: "test-player-4",
      email: "player4@test.com",
      displayName: "Player Four",
      emailVerified: true,
    },
  ];

  for (const user of testUsers) {
    try {
      await auth.createUser(user);
      console.log(`✅ Created user: ${user.email}`);
    } catch (error) {
      if (error.code !== "auth/uid-already-exists") {
        console.error(`❌ Error creating user ${user.email}:`, error);
      }
    }
  }
}

// Create test season
async function createTestSeason() {
  const seasonData = {
    name: "2024 Test Season",
    dateStart: Timestamp.fromDate(new Date("2024-01-01")),
    dateEnd: Timestamp.fromDate(new Date("2024-03-31")),
    registrationStart: Timestamp.fromDate(new Date("2023-12-01")),
    registrationEnd: Timestamp.fromDate(new Date("2023-12-31")),
    teams: [],
  };

  const seasonRef = await firestore
    .collection("seasons")
    .doc("test-season-2024")
    .set(seasonData);
  console.log(`✅ Created test season`);
  return firestore.collection("seasons").doc("test-season-2024");
}

// Create test teams
async function createTestTeams(seasonRef) {
  const teams = [
    {
      name: "Test Team Alpha",
      captains: [],
      roster: [],
      season: seasonRef,
      logo: null,
    },
    {
      name: "Test Team Beta",
      captains: [],
      roster: [],
      season: seasonRef,
      logo: null,
    },
    {
      name: "Test Team Gamma",
      captains: [],
      roster: [],
      season: seasonRef,
      logo: null,
    },
  ];

  const teamRefs = [];
  for (let i = 0; i < teams.length; i++) {
    const teamId = `test-team-${["alpha", "beta", "gamma"][i]}`;
    const teamRef = firestore.collection("teams").doc(teamId);
    await teamRef.set(teams[i]);
    teamRefs.push(teamRef);
    console.log(`✅ Created team: ${teams[i].name}`);
  }

  return teamRefs;
}

// Create test players
async function createTestPlayers(seasonRef, teamRefs) {
  const players = [
    {
      uid: "test-captain-1",
      firstname: "Captain",
      lastname: "One",
      email: "captain1@test.com",
      captain: true,
      team: teamRefs[0],
      seasons: [
        {
          season: seasonRef,
          paid: true,
          waiver: true,
          team: teamRefs[0],
        },
      ],
    },
    {
      uid: "test-captain-2",
      firstname: "Captain",
      lastname: "Two",
      email: "captain2@test.com",
      captain: true,
      team: teamRefs[1],
      seasons: [
        {
          season: seasonRef,
          paid: true,
          waiver: true,
          team: teamRefs[1],
        },
      ],
    },
    {
      uid: "test-captain-3",
      firstname: "Captain",
      lastname: "Three",
      email: "captain3@test.com",
      captain: true,
      team: teamRefs[2],
      seasons: [
        {
          season: seasonRef,
          paid: true,
          waiver: true,
          team: teamRefs[2],
        },
      ],
    },
    {
      uid: "test-player-1",
      firstname: "Player",
      lastname: "One",
      email: "player1@test.com",
      captain: false,
      team: teamRefs[0],
      seasons: [
        {
          season: seasonRef,
          paid: true,
          waiver: true,
          team: teamRefs[0],
        },
      ],
    },
    {
      uid: "test-player-2",
      firstname: "Player",
      lastname: "Two",
      email: "player2@test.com",
      captain: false,
      team: teamRefs[1],
      seasons: [
        {
          season: seasonRef,
          paid: true,
          waiver: true,
          team: teamRefs[1],
        },
      ],
    },
    {
      uid: "test-player-3",
      firstname: "Player",
      lastname: "Three",
      email: "player3@test.com",
      captain: false,
      team: null,
      seasons: [
        {
          season: seasonRef,
          paid: true,
          waiver: true,
          team: null,
        },
      ],
    },
    {
      uid: "test-player-4",
      firstname: "Player",
      lastname: "Four",
      email: "player4@test.com",
      captain: false,
      team: null,
      seasons: [
        {
          season: seasonRef,
          paid: false,
          waiver: true,
          team: null,
        },
      ],
    },
  ];

  for (const player of players) {
    await firestore.collection("players").doc(player.uid).set(player);
    console.log(`✅ Created player: ${player.firstname} ${player.lastname}`);
  }
}

// Create test games
async function createTestGames(seasonRef, teamRefs) {
  const games = [
    {
      away: teamRefs[0],
      home: teamRefs[1],
      season: seasonRef,
      week: 1,
      date: Timestamp.fromDate(new Date("2024-01-08")),
      location: "Test Rink A",
      awayScore: null,
      homeScore: null,
      completed: false,
    },
    {
      away: teamRefs[2],
      home: teamRefs[0],
      season: seasonRef,
      week: 1,
      date: Timestamp.fromDate(new Date("2024-01-09")),
      location: "Test Rink B",
      awayScore: null,
      homeScore: null,
      completed: false,
    },
    {
      away: teamRefs[1],
      home: teamRefs[2],
      season: seasonRef,
      week: 2,
      date: Timestamp.fromDate(new Date("2024-01-15")),
      location: "Test Rink A",
      awayScore: 3,
      homeScore: 2,
      completed: true,
    },
  ];

  for (let i = 0; i < games.length; i++) {
    await firestore
      .collection("games")
      .doc(`test-game-${i + 1}`)
      .set(games[i]);
    console.log(`✅ Created game ${i + 1}`);
  }
}

// Run seeding
async function seed() {
  try {
    await createTestUsers();
    const seasonRef = await createTestSeason();
    const teamRefs = await createTestTeams(seasonRef);
    await createTestPlayers(seasonRef, teamRefs);
    await createTestGames(seasonRef, teamRefs);
    console.log("🎉 Development database seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

seed();
