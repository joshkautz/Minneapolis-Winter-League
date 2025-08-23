import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// Initialize Firebase Admin for emulator
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

const app = initializeApp({
  projectId: "demo-minnesota-winter-league",
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

  const seasonRef = await firestore.collection("seasons").add(seasonData);
  console.log(`✅ Created test season: ${seasonRef.id}`);
  return seasonRef;
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
  ];

  const teamRefs = [];
  for (const team of teams) {
    const teamRef = await firestore.collection("teams").add(team);
    teamRefs.push(teamRef);
    console.log(`✅ Created team: ${team.name}`);
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
  ];

  for (const player of players) {
    await firestore.collection("players").doc(player.uid).set(player);
    console.log(`✅ Created player: ${player.firstname} ${player.lastname}`);
  }
}

// Run seeding
async function seed() {
  try {
    await createTestUsers();
    const seasonRef = await createTestSeason();
    const teamRefs = await createTestTeams(seasonRef);
    await createTestPlayers(seasonRef, teamRefs);
    console.log("🎉 Development database seeded successfully!");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
  }
}

seed();
