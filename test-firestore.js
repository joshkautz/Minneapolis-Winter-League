#!/usr/bin/env node

import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// Initialize Firebase Admin for emulator
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";

console.log("🔥 Testing Firestore connection...");
console.log("FIRESTORE_EMULATOR_HOST:", process.env.FIRESTORE_EMULATOR_HOST);

const app = initializeApp({
  projectId: "demo-minnesota-winter-league",
});

const firestore = getFirestore(app);

async function testFirestore() {
  try {
    console.log("📝 Creating a test document...");

    // Create a simple test document
    const testDoc = {
      name: "Test Document",
      created: Timestamp.now(),
      message: "Hello from seed script!",
    };

    const docRef = firestore.collection("test").doc("simple-test");
    await docRef.set(testDoc);

    console.log("✅ Successfully created test document!");

    // Try to read it back
    const doc = await docRef.get();
    if (doc.exists) {
      console.log("✅ Successfully read test document:", doc.data());
    } else {
      console.log("❌ Document not found when reading back");
    }

    // List all collections
    const collections = await firestore.listCollections();
    console.log(
      "📂 Collections found:",
      collections.map((c) => c.id)
    );

    process.exit(0);
  } catch (error) {
    console.error("❌ Error testing Firestore:", error);
    process.exit(1);
  }
}

testFirestore();
