#!/usr/bin/env node

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin for emulator
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";

const app = initializeApp({
  projectId: "minnesota-winter-league",
});

const firestore = getFirestore(app);

async function checkExistingData() {
  try {
    console.log("🔍 Checking existing data in Firestore...");

    // Check each collection
    const collections = ["seasons", "teams", "players", "games"];

    for (const collectionName of collections) {
      const snapshot = await firestore.collection(collectionName).get();
      console.log(`📁 ${collectionName}: ${snapshot.size} documents`);

      if (snapshot.size > 0) {
        snapshot.forEach((doc) => {
          console.log(`  - ${doc.id}:`, Object.keys(doc.data()));
        });
      }
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error checking data:", error);
    process.exit(1);
  }
}

checkExistingData();
