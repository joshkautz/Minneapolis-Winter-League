#!/usr/bin/env node

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin for emulator
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";

const PROJECT_ID = "minnesota-winter-league";

console.log("🔥 Firebase Emulator Debug Info");
console.log("================================");
console.log(`Project ID: ${PROJECT_ID}`);
console.log(`Firestore Host: ${process.env.FIRESTORE_EMULATOR_HOST}`);
console.log(`Emulator UI: http://localhost:4000`);
console.log(
  `Direct Firestore URL: http://localhost:4000/firestore/${PROJECT_ID}/data`
);
console.log("");

const app = initializeApp({
  projectId: PROJECT_ID,
});

const firestore = getFirestore(app);

async function showDataStructure() {
  try {
    console.log("📊 Data Structure:");
    console.log("==================");

    const collections = ["seasons", "teams", "players", "games"];

    for (const collectionName of collections) {
      const snapshot = await firestore.collection(collectionName).get();
      console.log(
        `\n📁 ${collectionName.toUpperCase()} (${snapshot.size} documents):`
      );

      if (snapshot.size > 0) {
        snapshot.forEach((doc) => {
          const data = doc.data();
          console.log(`  📄 ${doc.id}:`);

          // Show key fields for each collection type
          if (collectionName === "seasons") {
            console.log(`     Name: ${data.name}`);
            console.log(
              `     Dates: ${data.dateStart
                ?.toDate?.()
                ?.toDateString()} - ${data.dateEnd?.toDate?.()?.toDateString()}`
            );
          } else if (collectionName === "teams") {
            console.log(`     Name: ${data.name}`);
            console.log(`     Captains: ${data.captains?.length || 0}`);
            console.log(`     Roster: ${data.roster?.length || 0}`);
          } else if (collectionName === "players") {
            console.log(`     Name: ${data.firstname} ${data.lastname}`);
            console.log(`     Email: ${data.email}`);
            console.log(`     Captain: ${data.captain}`);
          } else if (collectionName === "games") {
            console.log(`     Week: ${data.week}`);
            console.log(`     Date: ${data.date?.toDate?.()?.toDateString()}`);
            console.log(`     Location: ${data.location}`);
            console.log(`     Completed: ${data.completed}`);
          }
        });
      } else {
        console.log("     (empty)");
      }
    }

    console.log("\n🎯 To view in Emulator UI:");
    console.log(`   1. Go to: http://localhost:4000`);
    console.log(`   2. Click on "Firestore Database"`);
    console.log(`   3. Make sure project is: ${PROJECT_ID}`);
    console.log(
      `   4. You should see the collections: ${collections.join(", ")}`
    );

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

showDataStructure();
